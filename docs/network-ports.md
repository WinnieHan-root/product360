# 网络端口申请单 & PG 数据写入接入

> 用途：向网络/安全组管理员申请开通端口时的依据，以及后续「把数据同步进 PostgreSQL」的接入方案。
> 服务器环境：阿里云 ECS 4C14G，Ubuntu 22.04，`/data` 数据盘，代码 `/data/product360`，单机 Docker Compose。

---

## 1. 端口申请单（可直接提交）

### 1.1 入方向（公网 → ECS）

| # | 协议 | 端口 | 授权对象（源 IP） | 用途 | 必要性 | 备注 |
|---|---|---|---|---|---|---|
| 1 | TCP | **80** | `0.0.0.0/0` | Web 前端 + `/api` 接口（Nginx 反代） | **必需** | 唯一对外业务入口 |
| 2 | TCP | **22** | JumpServer 出口 IP / 运维固定 IP（可多个） | SSH 运维、`git pull`、发版脚本 | **必需** | **禁止 0.0.0.0/0** |
| 3 | TCP | 443 | `0.0.0.0/0` | 后续 HTTPS（配域名 + 证书时） | 暂不需要 | 现在不申请，等上域名时一并开 |
| 4 | TCP | 5432 | **固定同步机出口 IP（尽量 /32）** | 直连 PostgreSQL 写入 | 按需 | 已提供 `deploy/docker-compose.pg-public.yml`；**禁止 0.0.0.0/0**，见 §2 方案 B |

### 1.2 出方向（ECS → 外网，阿里云默认全通，一般无需申请）

| # | 协议 | 端口 | 目的 | 用途 |
|---|---|---|---|---|
| 5 | TCP | 80 / 443 | 任意 | apt、Docker 镜像加速器、`registry.npmmirror.com`、GitHub |
| 6 | UDP / TCP | 53 | DNS | 域名解析 |
| 7 | TCP | 443 | 数据源地址（StarRocks/MySQL/对象存储等） | 若同步程序跑在 ECS 上，需能访问数据源 |

### 1.3 明确**不要**开放的端口

| 端口 | 服务 | 原因 |
|---|---|---|
| 3000 | NestJS API | 只经 Nginx `/api` 反代；容器内 `expose` 即可 |
| 5432 | PostgreSQL | 默认不开放：需显式叠加 `-f deploy/docker-compose.pg-public.yml` 才会发布到宿主机 |
| 5173 | Vite dev server | 仅本地开发使用，生产无此进程 |
| 8080 | 本地验证端口 | 生产用 `HTTP_PORT=80` |
| 2375 / 2376 | Docker API | 开=直接把 root 交给公网 |

> ⚠️ **Docker 会绕过 ufw**：`docker publish` 的端口走 iptables `DOCKER` 链，`ufw deny` 挡不住。
> 所以端口管控**只认阿里云安全组**（以及系统层的 `iptables` 直接规则），不要指望 ufw。

---

## 2. 数据同步写入 PostgreSQL：三种方案

**前置事实**：当前 `deploy/docker-compose.prod.yml` 里 postgres 只有 `expose: ["5432"]`，
**没有 publish 到宿主机**。所以哪怕安全组开了 5432，外部也连不上——必须改 compose。
这也说明「默认状态就是安全的」，开源端口是一个需要显式做出的决定。

### 方案 A（推荐）：SSH 隧道，公网不开 5432

服务器上把 PG 发布到回环地址：

```bash
cd /data/product360
docker compose -f deploy/docker-compose.prod.yml -f deploy/docker-compose.pg-tunnel.yml up -d
docker ps --format '{{.Names}}\t{{.Ports}}' | grep postgres   # 期望 127.0.0.1:5432->5432/tcp
```

在同步机上建隧道并写入：

```bash
# 同步机执行：把本地 15432 映射到 ECS 的 127.0.0.1:5432
ssh -N -L 15432:127.0.0.1:5432 root@<ECS公网IP>

# 另开一个终端验证（密码 = deploy/.env 里的 POSTGRES_PASSWORD）
psql "postgresql://product360:<密码>@127.0.0.1:15432/product360" -c "select count(*) from pd_spu;"
```

- 优点：公网只开 22，5432 完全不暴露；隧道内可再加 TLS
- 缺点：同步任务需要保持 SSH 长连接（`autossh` / systemd 可托管）
- 安全组申请：**只需第 2 条（22，限 IP）**

### 方案 B：公网直连 5432

仓库已内置覆盖文件 `deploy/docker-compose.pg-public.yml`（把 postgres 发布到 `0.0.0.0:5432`）：

```bash
cd /data/product360
docker compose -f deploy/docker-compose.prod.yml -f deploy/docker-compose.pg-public.yml up -d
docker ps --format '{{.Names}}\t{{.Ports}}' | grep postgres   # 期望 0.0.0.0:5432->5432/tcp
```

必须同时满足：

| 要求 | 做法 |
|---|---|
| **强密码（硬前置）** | `POSTGRES_USER` 的密码不能是初始值 `product360`（已在公开仓库）→ 先 `ALTER USER` 改 24 位随机，再同步改 `deploy/.env` 的 `POSTGRES_PASSWORD` / `DATABASE_URL`，最后 `up -d --no-deps --force-recreate api` |
| 源 IP 白名单 | 安全组授权对象填同步机**出口 IP /32**，不要 `0.0.0.0/0`（Docker publish 绕过 ufw，安全组是唯一管控） |
| 发布范围 | 若无白名单环境，改用 `"127.0.0.1:5432:5432"`（即方案 A 的覆盖文件） |
| 认证方式 | PG16 默认 `scram-sha-256`：`docker exec product360-postgres psql -U product360 -c "show password_encryption;"` |
| 传输加密 | 公网直连默认**无 TLS**（数据明文）。长期：配 `ssl=on` + 自签证书 + 客户端 `sslmode=require` |
| 监控 | 开 PG 日志审计，异常连接告警 |

```bash
# 服务器：确认容器内认证与加密
docker exec product360-postgres psql -U product360 -c "show password_encryption;"      # scram-sha-256
docker exec product360-postgres psql -U product360 -c "show ssl;"                      # off（未配证书时）
```

> 风险提示：5432 对公网暴露是最常见的入侵面之一（暴力破解 + PG 提权漏洞）。
> 若一定要开，**源 IP 白名单 + 强密码 + TLS 三件套缺一不可**。

### 方案 C（最安全）：同步程序直接跑在 ECS 上

数据源（StarRocks / MySQL / 对象存储）如果 ECS 内网可达，把同步进程放在 ECS 内，
`DATABASE_URL` 用容器网络 `postgres:5432`，**对外一个端口都不用开**。

```bash
# 示例：在宿主机上用一次性容器跑导入脚本
docker run --rm --network product360_default \
  -e DATABASE_URL="postgresql://product360:<密码>@postgres:5432/product360" \
  -v /data/sync:/sync <你的同步镜像> python /sync/load.py
```

- 优点：零公网暴露，吞吐最高（容器网络直连）
- 缺点：同步逻辑要能在 Linux 容器里跑

---

## 3. 同步到 PG 的实施约束（务必遵守，否则前后端语义会坏）

不论用哪个方案，导入时必须遵守项目既有契约（详见 `docs/align-source-model.md`）：

1. **只写 13 张契约表**：`pd_spu` / `pd_sku` / `sal_sku_code` / `sal_sku_day` / `scm_stock` /
   `voc_review_day` / `voc_nps_sentiment` / `voc_nps_tag` / `voc_ticket_topic` / `voc_competitor` /
   `user` / 其余两张；**不要自己加表或加外键**
2. **不造数据**：源系统没有的字段写 `NULL`，不要填 `0` / 空字符串；前端据此渲染「未接入」
3. **覆盖语义**：现有 `apps/api/src/sync` 是「先 truncate 再全量写入」，
   若改成增量同步，必须同步改 API 层的 `asOf`（`source.service.ts`）口径，否则页面会显示旧时间
4. **字段名/类型以 `apps/api/prisma/schema.prisma` 为准**，不要改列类型
5. **同步完成后**：`curl -s http://127.0.0.1/api/health`（`products` 计数变化即生效）；
   页面数据有 5 分钟级缓存语义时不需重启，若改了 schema 则需 `prisma db push` + 重启 api

---

## 4. 申请单填写模板（复制给网络管理员）

```
申请事项：阿里云 ECS 安全组入方向放通
实例：iZ7xv5xonwyeprmgxrixfaZ（4C14G，Ubuntu 22.04）
用途：商品中心 MVP 一期 Web 访问 + 运维

入方向规则：
  1) TCP 80   源 0.0.0.0/0            —— 业务 Web/API 访问（必需）
  2) TCP 22   源 <JumpServer出口IP>/32 —— SSH 运维与发版（必需，禁止全网）
  3) TCP 5432 源 <同步机出口IP>/32     —— 数据同步直连 PostgreSQL（禁止 0.0.0.0/0）

暂不申请：443（待域名备案/HTTPS 时另提）
出方向：保持默认全通（apt / 容器镜像 / npm 源 / GitHub）
```

> 如果同步机与 ECS **同一 region/VPC**：5432 的授权对象改填**私网网段**（如 `172.16.0.0/12`），
> 连接地址用 ECS 私网 IP，流量不出 VPC（免费、低延迟、不经公网）。
> 这种情况下可以**不申请公网 5432**。

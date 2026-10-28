# 部署执行手册（JumpServer 网页终端版）

> 适用场景：**无法从本地直连 ECS**，只能在 JumpServer 网页终端里操作。
> 与 `docs/deploy-aliyun.md` 的区别：本文为「逐段粘贴 + 每步校验」的执行脚本版，
> 去掉了需要交互式编辑器的步骤（不用 `vi`），改用 heredoc 生成 `.env`。

约定：

- 所有命令都在 **ECS** 上执行（JumpServer 里连到目标资产后的那个 shell）
- 每段都有「**期望**」，不符就停下，把输出发出来，不要继续往下走
- 建议先 `sudo -i` 进 root，省得每条命令都加 `sudo`（没有 sudo 权限就只能用当前用户，见 §0.3）

---

## 0. 路径约定（先定一次，后面所有命令都用它）

```bash
# 有数据盘（df -h 里能看到 /data 且容量 ≥50G）就用数据盘，否则用 /opt
export APP=/data/product360
mkdir -p "$(dirname "$APP")"
df -h "$(dirname "$APP")" | tail -1
```

> 为什么：镜像 + 构建缓存约 6 GB，20 GB 的系统盘会被写满。
> 若数据盘存在，还要把 Docker 数据目录也挪过去（`scripts/server-bootstrap.sh` 已自动处理，
> 手动做见 `docs/deploy-aliyun.md` §0.4）。下文所有命令都用 `$APP`，换路径只改这一个变量。

---

## 1. 预检（只读）

```bash
sudo -i                                  # 有 sudo 就进 root；没有就跳过，后面命令自己加 sudo
cat /etc/os-release | head -2
uname -m && nproc && free -h | head -2 && df -h / /opt 2>/dev/null | tail -2
docker --version 2>/dev/null; docker compose version 2>/dev/null; git --version 2>/dev/null
```

**期望**

| 项 | 期望值 | 不符怎么办 |
|---|---|---|
| 系统 | Ubuntu 22.04 / Alibaba Cloud Linux 3 等 | 其它 Linux 也能跑，只是包管理器不同 |
| 架构 | `x86_64` | `aarch64` 也能跑（镜像是本地构建，不拉预构建镜像），继续 |
| CPU / 内存 | ≥ 4 核 / ≥ 7 GiB | 2 核会构建很慢，加 `--build-arg` 无用，先扩配 |
| 根分区剩余 | ≥ 15 GB | 不足先清理或挂数据盘 |
| docker | 有版本号 + `Docker Compose version v2+` | 没有则执行 §1.1 |
| git | 有版本号 | 没有则执行 §1.1 |

### 1.1 装 Docker + git（缺哪个装哪个）

```bash
curl -fsSL https://raw.githubusercontent.com/WinnieHan-root/product360/main/scripts/server-bootstrap.sh -o /tmp/b.sh
bash /tmp/b.sh
docker --version && docker compose version && git --version
```

**期望**：三行版本号。若 `curl` 就失败（服务器出不了网，见 §1.2）。

### 1.2 出网能力检查

```bash
curl -sI -m 10 https://github.com | head -1
curl -sI -m 10 https://registry.npmmirror.com | head -1
```

**期望**：两条都返回 `HTTP/... 200` 或 `301`。

- 只有 github 通 → 构建时把 `NPM_REGISTRY` 设成 `https://registry.npmjs.org`
- 两个都不通 → **改用离线包**：本地 `pnpm deploy:pack` 生成 tar，用 JumpServer 的**文件上传**功能传到 `$(dirname "$APP")`，再 `tar -xzf`（跳过后面的 `git clone`）

**Docker Hub 是否可达（决定 build 能否成功）**：

```bash
curl -sI -m 8 https://registry-1.docker.io/v2/ | head -1
```

返回 `401` 才算通。国内 ECS 通常是 `i/o timeout`（DNS 解析到被墙的 Fastly IP），
此时必须配镜像加速器（单行命令，避免 heredoc）：

```bash
for m in https://docker.m.daocloud.io https://docker.1ms.run https://docker.xuanyuan.me https://docker.1panel.live; do printf "%-32s " "$m"; curl -sI -m 6 "$m/v2/" | head -1 || echo 不可达; done
```

```bash
python3 -c "import json;p='/etc/docker/daemon.json';d=json.load(open(p));d['registry-mirrors']=['https://docker.m.daocloud.io','https://docker.1ms.run','https://docker.xuanyuan.me','https://docker.1panel.live'];json.dump(d,open(p,'w'),indent=2)"
systemctl restart docker && docker info --format '{{json .RegistryConfig.Mirrors}}'
docker pull nginx:1.27-alpine
```

第三方加速器随时可能失效；最可靠的是阿里云账号专用加速器
（控制台 → 容器镜像服务 ACR → 镜像工具 → 镜像加速器，`https://xxxxxx.mirror.aliyuncs.com`）。

### 1.3 没有 root / sudo

全程用当前用户，但需要能写 `/opt`：

```bash
id && ls -ld /opt
```

写不进去就换目录：`export APP=~/product360`，端口 80 也需要 root 才能绑（此时把 `HTTP_PORT` 改成 `8080`，用 `http://IP:8080` 验收）。

---

## 2. 取代码

```bash
git clone https://github.com/WinnieHan-root/product360.git "$APP"
cd "$APP" && git log --oneline -1 && ls deploy scripts
```

**期望**：打印最近 3 条提交（最新应为 `docs: 新增 README...` 之后的提交），并列出 `deploy/`（4 个 Dockerfile/配置 + nginx 目录）与 `scripts/`（4 个 .sh）。

失败排查：

| 现象 | 处理 |
|---|---|
| `Could not resolve host` / 超时 | 服务器无外网 → 走离线包（§0.2） |
| `Repository not found` | 仓库转 private 了 → 配 deploy key（`docs/deploy-aliyun.md` §11.2） |
| 目录已存在且非空 | `rm -rf "$APP"` 后重来（确认没有 `.env` 要先备份） |

---

## 3. 生成 `deploy/.env`（不用 vi）

```bash
cd "$APP"
PUBIP=$(curl -s -m 5 ifconfig.me || curl -s -m 5 https://api.ipify.org)
PGPASS=$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-24)
JWT=$(openssl rand -hex 32)
cat > deploy/.env <<EOF
POSTGRES_USER=product360
POSTGRES_PASSWORD=$PGPASS
POSTGRES_DB=product360
DATABASE_URL=postgresql://product360:$PGPASS@postgres:5432/product360
JWT_SECRET=$JWT
PORT=3000
APP_ORIGIN=http://$PUBIP
HTTP_PORT=80
NPM_REGISTRY=https://registry.npmmirror.com
APP_VERSION=2026.10.28
EOF
chmod 600 deploy/.env
echo "===== deploy/.env ====="; cat deploy/.env
```

**期望**：把文件内容整段打印出来，其中 `POSTGRES_PASSWORD` 是一串 24 位随机字符。

**立刻做两件事**：

1. 把打印出来的 `POSTGRES_PASSWORD` 和 `JWT_SECRET` **抄到你的密码库里**（丢了只能重建库）
2. 确认 `APP_ORIGIN` 里的 IP 是公网 IP（不是内网 `172.x` / `10.x`；若是内网，说明 `ifconfig.me` 被墙，手动改成本机公网 IP）

> `POSTGRES_*` 三个值首次初始化后**不要再改**（改了连的是旧库名/旧密码）；`APP_VERSION` 可随手改。

> **网页终端提示**：JumpServer / 阿里云 Workbench 里粘贴多行 heredoc 常被加上行首空格，
> 导致结束符 `PY` / `EOF` 匹配不上、卡在 `>` 提示符（此时按 `Ctrl+C` 即可退出）。
> 遇到这种情况改用下面这条**单行**命令生成 `.env`：
>
> ```bash
> cd "$APP" && PUBIP=$(curl -s -m 5 https://ifconfig.me) && PGPASS=$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-24) && JWT=$(openssl rand -hex 32) && printf 'POSTGRES_USER=product360\nPOSTGRES_PASSWORD=%s\nPOSTGRES_DB=product360\nDATABASE_URL=postgresql://product360:%s@postgres:5432/product360\nJWT_SECRET=%s\nPORT=3000\nAPP_ORIGIN=http://%s\nHTTP_PORT=80\nNPM_REGISTRY=https://registry.npmmirror.com\nAPP_VERSION=2026.10.28\n' "$PGPASS" "$PGPASS" "$JWT" "$PUBIP" > deploy/.env && chmod 600 deploy/.env && cat deploy/.env
> ```

---

## 4. 构建镜像（3–6 分钟，最慢的一步）

```bash
cd "$APP"
docker compose -f deploy/docker-compose.prod.yml build
```

**期望**：末尾出现

```
Successfully tagged product360-web:2026.10.28
 Image product360-web:2026.10.28 Built
 Image product360-api:2026.10.28 Built
```

中途会看到 `pnpm install`、`prisma generate`、`vite build` 的输出，属正常。

失败排查：

| 现象 | 处理 |
|---|---|
| `Killed` / exit 137 | 内存不足：先 `docker compose -f deploy/docker-compose.prod.yml build web`，再 `... build api`（分开构建降峰值）；仍不行加 swap |
| `pnpm install` 卡住或 404 | 换源：编辑 §2 的 `NPM_REGISTRY` 为 `https://registry.npmjs.org` 后重跑 |
| `fetch failed` / 网络重置 | 同上；或配置 docker daemon 代理 |
| `Cannot find module '@product360/shared'` | 代码版本不对（构建顺序已修），`git pull` 后重来；仍报错把完整日志发我 |

构建完成后确认体积：

```bash
docker images | grep product360
```

**期望**：`product360-api` 约 1.2 GB、`product360-web` 约 79 MB。

---

## 5. 初始化数据库（只跑一次）

```bash
cd "$APP"
docker compose -f deploy/docker-compose.prod.yml --profile init run --rm db-init
```

**期望**（关键行）

```
  pd_sku               1979 行  ← ...
  pd_spu               1067 行  ← ...
  ...
✓ 同步完成，共写入 12047 行
✓ 账号 4 个（密码统一为 product360）：
  admin@product360.dev       platform_admin  商业字段=是 范围=全量
  ...
```

失败排查：

| 现象 | 处理 |
|---|---|
| 卡在 `Waiting for postgres` | `docker compose -f deploy/docker-compose.prod.yml logs postgres` 看是否密码/initdb 报错 |
| `P1001 Can't reach database server` | `DATABASE_URL` 的 host 必须是 `postgres`（容器名），不是 `localhost` |
| `relation "pd_spu" already exists` | 库里有旧数据，见 §9.1 重建 |
| 表建好了但 0 行 | 检查 `docs/sample_exports` 是否存在：`ls docs/sample_exports | wc -l` 应为 18 |

---

## 6. 启动

```bash
cd "$APP"
docker compose -f deploy/docker-compose.prod.yml up -d
sleep 20
docker compose -f deploy/docker-compose.prod.yml ps
```

**期望**

```
product360-api        Up (healthy)
product360-postgres   Up (healthy)
product360-web        Up (healthy)
```

`api` 首次可能要 30 秒才 healthy（等 PG + Nest 启动），`Up (health: starting)` 属正常，再等 20 秒。

---

## 7. 验收（服务器本机，6 条）

```bash
# ① 健康检查（公开）
curl -s http://127.0.0.1/api/health
# 期望：{"status":"ok","products":1067,...}

# ② 静态站
curl -s -o /dev/null -w "index:%{http_code}\n" http://127.0.0.1/

# ③ SPA 深链（应 200，不能 404）
for p in /products /products/SPU000167/overview /products/SPU000167/channels; do
  curl -s -o /dev/null -w "$p %{http_code}\n" http://127.0.0.1$p
done

# ④ 无 token 必须 401
curl -s -o /dev/null -w "no-token:%{http_code}\n" http://127.0.0.1/api/products

# ⑤ 登录拿 token
TOKEN=$(curl -s -X POST http://127.0.0.1/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"admin@product360.dev","password":"product360"}' \
  | sed -n 's/.*"accessToken":"\([^"]*\)".*/\1/p'); echo "token长度: ${#TOKEN}"

# ⑥ 列表首条（应为 SPU000167 M6吸奶器）
curl -s "http://127.0.0.1/api/products?pageSize=1" -H "authorization: Bearer $TOKEN" | head -c 200; echo
```

**期望**：① `products:1067`；② ③ 全 `200`；④ `401`；⑤ token 长度 188；⑥ 返回 JSON 含 `"spuCode":"SPU000167"`。

然后**从你自己的电脑浏览器**打开 `http://<ECS公网IP>`（安全组需放行 80），用 `admin@product360.dev / product360` 登录。

---

## 8. 收尾（安全）

```bash
# ① 确认对外只开 80（容器层不外泄 3000/5432）
docker ps --format '{{.Names}}\t{{.Ports}}'
# 期望：只有 product360-web 有 0.0.0.0:80->80，其它两行没有宿主机端口

# ② 安全组（阿里云控制台手动）：入方向仅 22（限你公司出口 IP）+ 80（0.0.0.0/0）

# ③ 改默认密码（4 个账号密码都是 product360）
NEWPASS='换成你的强密码'
docker exec product360-api node -e "
const {PrismaClient}=require('@prisma/client');const {hashSync}=require('bcryptjs');
const p=new PrismaClient();
p.user.update({where:{email:'admin@product360.dev'},data:{passwordHash:hashSync(process.argv[1],10)}})
 .then(()=>console.log('admin 密码已更新')).finally(()=>p.\$disconnect());" "$NEWPASS"
```

> ②安全组不建议在网页终端里做（要控制台），③改完请立刻用新密码登录验证一次。

---

## 9. 备用操作

### 9.1 重建数据库（会清空数据）

```bash
cd "$APP"
docker compose -f deploy/docker-compose.prod.yml down
docker volume rm product360_pg
docker compose -f deploy/docker-compose.prod.yml --profile init run --rm db-init
docker compose -f deploy/docker-compose.prod.yml up -d
```

### 9.2 一键发版（后续代码更新）

```bash
cd "$APP" && VERSION=2026.11.03 bash scripts/release-git.sh
```

（本地先 `git push`；脚本会 `git pull` → 改 tag → 重建 → 重启 → 自动跑 §7 的验收）

### 9.3 只看日志

```bash
cd "$APP"
docker compose -f deploy/docker-compose.prod.yml logs --tail=80 api
docker compose -f deploy/docker-compose.prod.yml logs --tail=40 web     # Nginx
```

### 9.4 备份

```bash
mkdir -p /opt/backup
docker exec product360-postgres pg_dump -U product360 product360 | gzip > /opt/backup/product360-$(date +%F).sql.gz
ls -lh /opt/backup
```

---

## 10. 需要回传给我的信息

走到哪一步失败，把这些一起发我（不要发密码）：

```bash
cd "$APP"
git log --oneline -1
docker compose -f deploy/docker-compose.prod.yml ps
docker compose -f deploy/docker-compose.prod.yml logs --tail=60 api
docker images | grep product360
df -h / | tail -1 && free -h | head -2
```

另附：失败的那条命令 + 完整报错（截图或复制文本都行）。
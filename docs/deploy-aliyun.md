# 阿里云部署手册（第一期）

> 目标形态：**一台 ECS 跑三个容器** —— Nginx（静态站 + `/api` 反代）、NestJS API、PostgreSQL 16。
> 访问方式：**公网 IP + 80 端口**，暂不配域名与 HTTPS（§7 给了后续步骤）。
> 交付方式：**从 GitHub 仓库拉代码**（`git clone` / `git pull`）→ 服务器上构建并启动；
> 服务器无法出网时才用 tar 包离线交付（§3 方式 B）。

代码仓库：<https://github.com/WinnieHan-root/product360>（分支 `main`）

本文所有命令都在「本地」或「ECS」明确标注，不要混着执行。

---

## 0. 资源清单

### 0.1 已具备

| 资源 | 规格 | 说明 |
|---|---|---|
| ECS 实例 | 4 vCPU / 8 GiB | 已有；容器构建峰值约 2.5–3 GB 内存，8 GiB 够用 |
| 系统盘 | ≥ 60 GB 建议 | 两个镜像约 1.3 GB，加上构建缓存与 PG 数据，40 GB 会偏紧 |

### 0.2 需要确认/准备

| 项 | 要求 | 说明 |
|---|---|---|
| 操作系统 | Ubuntu 22.04 / Alibaba Cloud Linux 3 | `scripts/server-bootstrap.sh` 覆盖 apt 与 dnf 两系 |
| 公网带宽 | 按量 5 Mbps 起 | 首屏 JS 约 2.2 MB（未拆分），5 Mbps 下约 4 秒；后续可做代码分割 |
| 安全组入方向 | 22（仅自己的 IP）、80（0.0.0.0/0） | **5432 / 3000 不要对公网放行**，两个端口只在容器网络内可见 |
| 磁盘 | 建议挂一块数据盘到 `/opt` | PG 数据在 docker volume，落在 `/var/lib/docker` |
| Docker | 由 `server-bootstrap.sh` 安装 | 版本 ≥ 24，含 `docker compose` 插件 |
| git | 由 `server-bootstrap.sh` 安装 | 走 GitHub 拉代码需要；纯 tar 包交付可不装 |
| 出网能力 | 能访问 `github.com` 与 npm registry | 若 ECS 不能出网：改用 tar 包交付（§3 方式 B），并把 `NPM_REGISTRY` 指向内网源 |
| 仓库权限 | 仓库当前为 **public**，`https://` 匿名可 clone | 转为 private 后需在 ECS 配 deploy key，见 §11.2 |

### 0.3 占用的端口

| 端口 | 进程 | 暴露范围 |
|---|---|---|
| 80 | `product360-web`（Nginx） | 公网（安全组放行） |
| 3000 | `product360-api` | 仅容器网络 `product360` |
| 5432 | `product360-postgres` | 仅容器网络 `product360` |

---

## 1. 部署资源清单（仓库内新增文件）

| 文件 | 作用 |
|---|---|
| `deploy/api.Dockerfile` | API 镜像：装依赖 → `prisma generate` → 构建 shared + api |
| `deploy/web.Dockerfile` | Web 镜像：Vite 构建 → 拷进 `nginx:1.27-alpine` |
| `deploy/nginx/default.conf` | SPA fallback、`/api` 反代、gzip、静态资源长缓存、安全响应头 |
| `deploy/docker-compose.prod.yml` | 三容器编排 + 健康检查 + 一次性 `db-init` 任务 |
| `deploy/.env.production.example` | 生产环境变量模板（复制成 `deploy/.env`） |
| `.dockerignore` | 排除 `node_modules` / `dist` / `.env`，构建上下文从 1 GB+ 降到 20 MB |
| `scripts/package-deploy.sh` | 本地打包 `dist-deploy/product360-deploy-<时间戳>.tar.gz` + sha256 |
| `scripts/server-bootstrap.sh` | ECS 上装 Docker、配镜像加速、建 `/opt/product360` |
| `scripts/release.sh` | ECS 上构建、初始化库、启动、健康检查 + 冒烟 |
| `scripts/release-git.sh` | ECS 上 `git pull` + `release.sh` 一条命令发版（§5.1 主路径） |
| `apps/api/src/health/*` | `GET /api/health`（公开），容器 healthcheck 与上线验收都用它 |
| `apps/api/src/main.ts` | CORS 来源改为 `APP_ORIGIN` 环境变量（原先硬编码 localhost） |
| `.gitignore` | 排除 `.env` / `node_modules` / `dist` / `dist-deploy` / `.pi`（agent 会话状态） |

> 仓库里**不含** `deploy/.env`、`node_modules`、构建产物；`docs/sample_exports`（18 个 CSV / 17 MB）随仓库提交，`db-init` 需要它。

---

## 2. 总流程（一次走完约 15 分钟）

```
阿里云 ECS                                           本地
──────────────────────────────────────────────────────────────
1 server-bootstrap.sh（装 Docker + git，只需一次）
2 git clone → /opt/product360
3 配置 deploy/.env（密码、JWT_SECRET）
4 INIT_DB=1 bash scripts/release.sh
     build → db-init → up → 健康检查 → 冒烟
5 浏览器打开 http://<公网IP>
                                                     6 后续发版：本地 push
                                                        → 服务器 release-git.sh
```

离线场景把第 1–2 步换成「scp tar 包 + 解包」，其余步骤完全一致（§3 方式 B）。

---

## 3. 首次部署（逐步执行）

### 步骤 1｜服务器初始化（只做一次）

```bash
ssh root@<ECS公网IP>
# 仓库已是 public，脚本可直接从 raw 拉，不必先 clone
curl -fsSL https://raw.githubusercontent.com/WinnieHan-root/product360/main/scripts/server-bootstrap.sh -o /tmp/bootstrap.sh
sudo bash /tmp/bootstrap.sh
```

做三件事：装 Docker + git、配镜像加速（含日志轮转）、建 `/opt/product360`。
若代码已经在服务器上，也可以 `sudo bash /opt/product360/scripts/server-bootstrap.sh`。

### 步骤 2｜取代码（二选一）

**方式 A｜Git 拉取（推荐，便于后续 `git pull` 发版）**

```bash
cd /opt
git clone https://github.com/WinnieHan-root/product360.git product360
cd product360
git log --oneline -1          # 应看到最新提交
```

**方式 B｜tar 包离线交付（ECS 不能出网时）**

```bash
# 本地
cd ~/product360
bash scripts/package-deploy.sh                 # → dist-deploy/product360-deploy-<时间戳>.tar.gz（约 8 MB）
scp dist-deploy/product360-deploy-*.tar.gz* root@<ECS公网IP>:/opt/product360/

# 服务器
cd /opt/product360
tar -xzf product360-deploy-*.tar.gz
sha256sum -c product360-deploy-*.tar.gz.sha256   # 校验
```

包内含源码、`pnpm-lock.yaml`、`docs/sample_exports/*.csv`（`db-init` 要用），
不含 `node_modules` / `dist` / `.env` / `.git`。

### 步骤 3｜配置环境变量

```bash
cd /opt/product360
cp deploy/.env.production.example deploy/.env
chmod 600 deploy/.env
openssl rand -hex 32                                     # 生成 JWT_SECRET
openssl rand -base64 24                                  # 生成 POSTGRES_PASSWORD
vi deploy/.env                                           # 填 POSTGRES_PASSWORD / JWT_SECRET / APP_ORIGIN
```

`deploy/.env` 必填项：

| 变量 | 示例 | 说明 |
|---|---|---|
| `POSTGRES_USER` / `POSTGRES_DB` | `product360` | 初始化后不要再改，改了 PG 里还是旧库名 |
| `POSTGRES_PASSWORD` | 32 位随机 | **强密码**，`openssl rand -base64 24` |
| `JWT_SECRET` | `openssl rand -hex 32` | 换掉后所有已登录用户需重新登录 |
| `APP_ORIGIN` | `http://<ECS公网IP>` | 浏览器同源部署其实不跨源，留着便于将来加域名 |
| `HTTP_PORT` | `80` | 若 80 被占用可临时改 8080 验证 |
| `NPM_REGISTRY` | `https://registry.npmmirror.com` | 国内构建显著提速 |
| `APP_VERSION` | `2026.10.27` | 镜像 tag，发版递增，回滚时用 |

> `deploy/.env` 不进仓库、不进镜像（`.gitignore` + `.dockerignore` 双重排除）。
> 方式 B 覆盖解包时它也不会被冲掉 —— 但**首次部署必须新建**。

### 步骤 4｜构建 + 初始化数据库 + 启动

```bash
cd /opt/product360
INIT_DB=1 bash scripts/release.sh
```

它依次做：

1. `docker compose build`（首次 3–6 分钟，之后走缓存 30 秒）
2. `docker compose --profile init run --rm db-init`
   - `prisma db push` 建 13 张表（无 migration 目录，走 schema 直推）
   - `node dist/sync/cli.js` 加载 `docs/sample_exports/*.csv` → 12047 行
   - `tsx prisma/seed.ts` 写 4 个账号
3. `docker compose up -d`
4. 轮询 `/api/health` 直到 `{"status":"ok","products":1067}`
5. 登录 + 拉一条列表验证

> `INIT_DB=1` 只在**首次**（或重建库时）用。平时发版不带这个环境变量，不会清数据。

### 步骤 5｜浏览器验收

打开 `http://<ECS公网IP>`，用 `admin@product360.dev / product360` 登录。

---

## 4. 验收清单

```bash
# 健康检查（公开，无需 token）
curl -s http://127.0.0.1/api/health
# {"status":"ok","products":1067,...}

# 三个容器都 healthy
docker compose -f /opt/product360/deploy/docker-compose.prod.yml ps

# SPA 深链能直达（刷新不 404）
for p in / /products /products/SPU000167/overview; do
  curl -s -o /dev/null -w "$p %{http_code}\n" http://127.0.0.1$p
done

# 无 token 必须 401
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1/api/products

# 登录 + 列表首条（应为 coverage=4 的 SPU000167）
TOKEN=$(curl -s -X POST http://127.0.0.1/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"admin@product360.dev","password":"product360"}' \
  | sed -n 's/.*"accessToken":"\([^"]*\)".*/\1/p')
curl -s "http://127.0.0.1/api/products?pageSize=1" -H "authorization: Bearer $TOKEN" | head -c 200
```

页面级验收（与本地 P0/P1 同一套标准）：

- 1280 / 1440 宽度下四页无横向滚动
- 列表页 5 张摘要卡 + 3 张分布图有数据
- `employee@product360.dev` 登录后商业字段显示「无权限」，不显示 `$0.00`
- 断网/强刷任意详情页不出现 404（SPA fallback 生效）

---

## 5. 日常运维

### 5.1 发版（不重置数据）

**主路径｜Git（一次命令）**

```bash
# 本地：提交并推送
cd ~/product360
git add -A && git commit -m "feat: ..." && git push

# 服务器：拉取 + 重建镜像 + 重启 + 验收
cd /opt/product360
git pull --ff-only
bash scripts/release-git.sh
```

`release-git.sh` = 工作区干净检查 + `git pull --ff-only` + 可选更新 `APP_VERSION` + `release.sh`：
带 `VERSION=2026.11.03` 才会改镜像 tag（旧 tag 保留，随时可回滚）；不带就沿用当前 tag 覆盖重建。

**备用路径｜tar 包（ECS 不能出网时）**

```bash
# 本地
bash scripts/package-deploy.sh
scp dist-deploy/product360-deploy-*.tar.gz* root@<IP>:/opt/product360/

# 服务器（deploy/.env 不会被覆盖）
cd /opt/product360
tar -xzf product360-deploy-*.tar.gz
sed -i 's/^APP_VERSION=.*/APP_VERSION=2026.11.03/' deploy/.env
bash scripts/release.sh
```

发版前建议打 tag，回滚时直接切回去：

```bash
git tag -a deploy-2026.11.03 -m "发版" && git push --tags
```

### 5.2 回滚

- **代码回滚（Git）**：`git fetch --tags && git checkout deploy-2026.10.27 && bash scripts/release.sh`
  回完用 `git checkout main` 回到主干
- **代码回滚（tar）**：解压上一版 tar 包，`bash scripts/release.sh`
- **镜像回滚**：把 `deploy/.env` 的 `APP_VERSION` 改回上一版 tag，`docker compose up -d`（不用重新构建）
- **数据回滚**：见 5.4 备份

### 5.3 日志与状态

```bash
cd /opt/product360/deploy
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f --tail=100 api
docker compose -f docker-compose.prod.yml logs -f --tail=100 web      # 即 Nginx access/error log
docker stats --no-stream
```

日志已限制 `max-size=50m / max-file=3`，不会撑爆磁盘。

### 5.4 备份与恢复

```bash
# 备份（建议加进 crontab，每天 03:00）
mkdir -p /opt/backup
docker exec product360-postgres pg_dump -U product360 product360 \
  | gzip > /opt/backup/product360-$(date +%F).sql.gz

# 保留 7 天
find /opt/backup -name 'product360-*.sql.gz' -mtime +7 -delete

# 恢复
gunzip -c /opt/backup/product360-2026-10-27.sql.gz \
  | docker exec -i product360-postgres psql -U product360 -d product360
```

crontab 一行：

```
0 3 * * * docker exec product360-postgres pg_dump -U product360 product360 | gzip > /opt/backup/product360-$(date +\%F).sql.gz
```

### 5.5 重建数据库（会清空）

```bash
cd /opt/product360/deploy
docker compose -f docker-compose.prod.yml down
docker volume rm product360_pg
cd .. && INIT_DB=1 bash scripts/release.sh
```

---

## 6. 安全事项（上线前必须做）

1. **改掉默认密码**：4 个账号密码都是 `product360`。上线后至少改 admin，改法：
   ```bash
   docker exec -it product360-api node -e "
   const {PrismaClient}=require('@prisma/client');const {hashSync}=require('bcryptjs');
   new PrismaClient().user.update({where:{email:'admin@product360.dev'},data:{passwordHash:hashSync(process.argv[1],10)}}).then(()=>console.log('ok'))" '新密码'
   ```
2. **安全组**：只放行 22（限制来源 IP）和 80；禁止 3000 / 5432 对公网开放。
   `docker-compose.prod.yml` 已用 `expose` 而非 `ports`，容器层不会外泄这两个端口。
3. **JWT_SECRET** 必须换掉模板值；轮换等于强制重新登录。
4. **`deploy/.env` 权限 600**，不进 tar 包、不进镜像（`.dockerignore` 已排除）。
5. 未配 HTTPS 前，登录密码是明文传输 —— 这是「先用 IP 跑通」的已知代价，正式对外前按 §7 加 HTTPS。

---

## 7. 后续：接域名 + HTTPS

前提：域名已在阿里云备案（大陆节点未备案会被拦截）。

1. 域名 A 记录指向 ECS 公网 IP。
2. 安全组放行 443。
3. 申请证书：阿里云「数字证书管理服务」免费 DV 证书，下载 Nginx 格式（`.pem` + `.key`），上传到 `/opt/product360/deploy/certs/`。
4. 新增 `deploy/nginx/default.conf` 的第二个 server 块（10 行左右，替代 certbot 方案）：

```nginx
server {
    listen 443 ssl;
    http2 on;
    server_name product.example.com;
    ssl_certificate     /etc/nginx/certs/product.pem;
    ssl_certificate_key /etc/nginx/certs/product.key;
    # 其余 location 与 80 的 server 块一致
}

server {
    listen 80;
    server_name product.example.com;
    return 301 https://$host$request_uri;
}
```

5. `docker-compose.prod.yml` 的 `web` 服务加：

```yaml
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./certs:/etc/nginx/certs:ro
```

6. 把 `deploy/.env` 的 `APP_ORIGIN` 改成 `https://product.example.com`，`bash scripts/release.sh`。

也可用 certbot 自动续期（`certbot --nginx`），但需要容器内安装 certbot 或宿主机装 nginx，证书挂载方案更简单。

---

## 8. 已知限制（与代码现状对齐，不是部署缺陷）

| 限制 | 影响 | 处理 |
|---|---|---|
| 源表 `spu_image` 混杂三类值：阿里云 OSS 公网 URL、相对 key、内网 IP 的 presigned URL（已过期） | 部分商品图不显示，前端显示「无图」占位 | 数据侧问题，第一期不修；相对 key 需要拼 OSS 前缀时再补 |
| 无 Prisma migration，靠 `db push` | schema 变更无版本历史，改错只能重建 | 第二期上数据写入前补 migration |
| 单机单点，无高可用 | ECS 故障即不可用 | 第一期只读 MVP 可接受；要 HA 时迁 RDS + SLB |
| Web 首屏 JS 2.2 MB（未拆包） | 移动网络首屏慢 | 后续按路由 `import()` 拆分 + `manualChunks` |
| 4 个演示账号硬编码密码 | 安全风险 | 见 §6.1 |
| 样例数据 17 MB 打进镜像 | 镜像变大 | 可用 `SAMPLE_EXPORT_DIR` 外挂，或用对象存储分发 |
| 仓库 public，文档内含演示账号密码 | 任何人可读 | 上线前改密码（§6.1）；需要保密就把仓库转 private（§11.2） |

---

## 9. 排障

| 现象 | 原因 | 处理 |
|---|---|---|
| `release.sh` 卡在健康检查 | API 起不来，最常见是 `DATABASE_URL` 错 | `docker compose logs api`；确认 `.env` 里 PG 密码与 `postgres` 容器一致 |
| `EADDRINUSE :3000` | 宿主机已有进程占用 3000（本地开发常见） | 生产不会出现（端口不 publish）；本地验证时先 `pkill -f "nest start"` |
| `prisma: engine not found` / `Query engine library … not found` | 镜像里没跑 `prisma generate`，或 build 与 runtime 的 libc 不一致 | `deploy/api.Dockerfile` 已固定 `node:22-bookworm-slim` + 安装 `openssl` |
| 构建时 `Killed` | 内存不足 | 4C8G 正常不会；若降到 2G，先 `docker compose build web` 再 `build api`，或加 swap |
| 页面白屏但 `/api/health` 正常 | 前端打包时 API 基址不对 | 前端用相对路径 `/api`，必须经 Nginx 反代访问，不要直接开 `http://IP:3000` |
| 刷新详情页 404 | Nginx 缺 SPA fallback | `deploy/nginx/default.conf` 的 `try_files … /index.html` 已在，确认配置文件被挂进容器 |
| 登录 401 / token 立刻失效 | 换过 `JWT_SECRET` | 属预期，重新登录 |
| 中文排序/大小写异常 | PG locale | `POSTGRES_INITDB_ARGS: --encoding=UTF8 --locale=C` 已固定；重建库才能改 |
| `git clone` 卡住 / `Could not resolve host` | ECS 出网受限 | 改走 tar 包交付（§3 步骤 2 方式 B） |
| `Permission denied (publickey)` | 仓库转 private 或 SSH key 未配 | 见 §11.2 deploy key；或临时用 `https://` 地址 |
| `git pull` 报 `dubious ownership` | `/opt/product360` 属主与执行用户不同 | `git config --global --add safe.directory /opt/product360` |
| `release-git.sh` 报本地有改动 | 服务器上直接改过文件 | `git stash` 或 `git checkout -- .` 后再发版 |

---

## 10. 本次已在本地完整验证（macOS + Docker 29.5.2）

不是纸面推演，以下均在本地容器里跑通：

| 验证项 | 结果 |
|---|---|
| `docker compose build` | api 1.22 GB / web 79 MB，构建通过 |
| `--profile init run --rm db-init` | `prisma db push` + 12047 行同步 + 4 账号写入成功 |
| 三容器健康状态 | `api healthy` / `postgres healthy` / `web healthy` |
| `GET /api/health` | `{"status":"ok","products":1067}` |
| SPA 深链 | `/`、`/products`、`/products/SPU000167/overview`、`/channels` 全 200，直达刷新不 404 |
| 静态资源缓存 | `/assets/index-*.js` 200，`Cache-Control: public, immutable` |
| 关键接口 | 登录 201、列表返回 `SPU000167`、overview 正常 |
| 浏览器真实渲染（容器链路，1280 宽） | 四页全部渲染，`scrollWidth == viewport`，**0 console error** |
| `scripts/release-git.sh`（本次新增） | 工作区脏时正确中止；干净时 `git pull` → 打 tag `2026.10.28` → 重建重启 → 健康检查 + 冒烟全通过 |
| `raw.githubusercontent.com` 拉 bootstrap 脚本 | 200 / 1694 B，公开仓库匿名可取 |

本地复现命令（可选，用于改配置后回归）：

```bash
cd ~/product360/deploy
cp .env.production.example .env && chmod 600 .env   # 按需改 HTTP_PORT=8080
docker compose -f docker-compose.prod.yml --profile init run --rm db-init
docker compose -f docker-compose.prod.yml up -d
curl -s http://127.0.0.1:8080/api/health
```

---

## 11. 代码仓库

### 11.1 仓库信息

| 项 | 值 |
|---|---|
| 地址 | <https://github.com/WinnieHan-root/product360> |
| 分支 | `main`（唯一主干，直接提交） |
| 可见性 | 当前 **public** |
| clone（匿名） | `git clone https://github.com/WinnieHan-root/product360.git` |
| clone（SSH） | `git clone git@github.com:WinnieHan-root/product360.git`（需账号已加 SSH key） |
| 大小 | 约 9.3 MB / 118 文件（含 17 MB 样例 CSV 压缩后的历史） |

仓库里**有**：源码、`pnpm-lock.yaml`、`deploy/`、`scripts/`、`docs/`（含样例 CSV）。
仓库里**没有**：`deploy/.env`、`node_modules`、`dist`、`dist-deploy`、`.pi`。

### 11.2 仓库转 private 后怎么拉

public 仓库 ECS 上无需凭据；一旦转 private，给服务器配 **deploy key**（只读、只对这一个仓库）：

```bash
# 服务器上生成专用 key
ssh-keygen -t ed25519 -C "ecs-deploy" -f ~/.ssh/product360_deploy -N ""
cat ~/.ssh/product360_deploy.pub
# → 粘贴到 GitHub 仓库 Settings → Deploy keys（不勾 Allow write）

cat >> ~/.ssh/config <<'CFG'
Host github-product360
  HostName github.com
  User git
  IdentityFile ~/.ssh/product360_deploy
  IdentitiesOnly yes
CFG

# 用别名 clone（已有目录则改 remote）
cd /opt
git clone git@github-product360:WinnieHan-root/product360.git product360
# 或：git remote set-url origin git@github-product360:WinnieHan-root/product360.git
```

### 11.3 提交前自检（防止把敏感文件推上去）

```bash
cd ~/product360
git status --short                        # 不应出现 .env / deploy/.env
git ls-files | grep -E '(^|/)\.env$'      # 应为空
docker run --rm -v "$PWD":/w -w /w alpine sh -c 'grep -rl "POSTGRES_PASSWORD" --include="*.env" . || true'
```

`.env` 已被 `.gitignore` 排除，但**新建环境变量文件时仍要确认命名落在忽略规则内**（例如 `deploy/.env.local` 不在忽略列表里，需手动加）。

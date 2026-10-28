# 商品中心 Product360（MVP 第一期）

面向品牌运营的**商品只读视图**：一个列表页 + 一个商品详情（概览 / 渠道 / 外部口碑 三个页签），
所有字段来自 8 张源表的样例导出，经 NestJS 聚合成统一契约后再给前端。

> **当前阶段：第一期（只读查看）。**
> 明确不做：素材中心、任务中心、对话式分析、主数据写入、身份关系修改、批量编辑、渠道回写、评论治理。
> 第二期才做工作台 / 草稿 / 审核 / 发布。

---

## 技术栈

| 层 | 选型 |
|---|---|
| 前端 | React 18 + TypeScript + Vite + Ant Design 5 + ECharts |
| 后端 | NestJS 11 + Prisma 6 + PostgreSQL 16 |
| 共享契约 | `packages/shared`（前后端共用的类型与枚举，`tsc` 产物） |
| 部署 | Docker Compose：Nginx + API + PostgreSQL 单机三容器 |
| 包管理 | pnpm workspace（`apps/*` + `packages/*`） |

---

## 目录结构

```
apps/
  api/                     NestJS 后端
    prisma/schema.prisma   13 张底表（无外键，按页面组织）
    prisma/seed.ts         4 个演示账号（不写业务数据）
    src/catalog/           列表页：筛选 / 排序 / 全量分布统计
    src/overview/          概览页签：基础信息 / 包装 / 变体
    src/channels/          渠道页签：销售窗口 / 库存 / 渠道贡献
    src/external/          外部页签：NPS / 评论 / 工单主题 / 竞品
    src/context/           商品上下文（顶栏与面包屑）
    src/common/            五态模型、字段包装、权限范围
    src/sync/              CSV 加载器（样例导出 → PostgreSQL）
    src/health/            公开的 GET /api/health
  web/                     React 前端
    src/pages/             列表页 + 三个详情页签
    src/components/        State / DataValue / SectionCard / 图表基元
    src/styles.css         设计 token 与布局基元
packages/shared/           前后端共用类型
deploy/                    Dockerfile、nginx、compose.prod、.env 模板
scripts/                   打包、服务器初始化、发版
docs/                      PRD、数据契约、视觉评审、部署手册、样例数据
```

---

## 快速开始（本地）

前置：**Node.js 20+**、**pnpm 9+**、**Docker**（只用它跑 PostgreSQL）。

```bash
# 1. 装依赖
pnpm install

# 2. 起数据库
docker compose up -d          # 仅 postgres:16，监听 localhost:5432

# 3. 配置环境变量（.env 在仓库根目录，前后端共用）
cp .env.example .env
# 把 .env 里两处 change-me 换成同一个密码，DATABASE_URL 里的密码也要一致
vi .env

# 4. 建表 → 灌样例数据 → 写账号
pnpm db:push                  # prisma db push + generate（无 migration 目录）
pnpm db:sync                  # 读取 docs/sample_exports/*.csv，写入 12047 行
pnpm db:seed                  # 创建 4 个演示账号

# 5. 启动（shared 先构建，然后 api:3000 + web:5173 并行）
pnpm dev
```

打开 <http://localhost:5173>，用下表任一账号登录。

### 演示账号

密码统一 `product360`（**上线前必须改，见 `docs/deploy-aliyun.md` §6.1**）。

| 账号 | 角色 | 商业字段 | 数据范围 |
|---|---|---|---|
| `admin@product360.dev` | 平台管理员 | 可见 | 全量 1067 个 SPU |
| `data@product360.dev` | 数据管理员 | 可见 | 类目 CA002（282 个） |
| `operator@product360.dev` | 运营 | 可见 | 品牌 Momcozy（754 个） |
| `employee@product360.dev` | 普通员工 | **不可见** | 品牌 Momcozy（754 个） |

> 用 `employee` 登录可以直接验证权限裁剪：销售、金额、星级等商业字段显示「无权限」，
> 全站不出现 `$0.00` 或「0 个」这类假数据。

---

## 页面与接口

| 页面 | 路由 | 主要接口 |
|---|---|---|
| 登录 | `/login` | `POST /api/auth/login`、`GET /api/auth/me` |
| 商品列表 | `/products` | `GET /api/products`（筛选 / 排序 / 分页 + 全量分布）<br>`GET /api/meta/brands`、`GET /api/meta/categories` |
| 概览 | `/products/:spu/overview` | `GET /api/products/:spu/overview`、`GET /api/products/:spu/context` |
| 渠道 | `/products/:spu/channels` | `GET /api/products/:spu/channels?days=7..90` |
| 外部口碑 | `/products/:spu/external` | `GET /api/products/:spu/external?days=7..90` |
| 健康检查 | — | `GET /api/health`（公开，无需 token） |

接口契约的字段级说明见 `docs/align-source-model.md`（§4 逐接口、§6 偏离记录）。

---

## 三条硬规则

1. **不造数据**：字段必须能在源表里找到出处，找不到就返回 `not_connected` 并显示「未接入」，绝不填 0。
2. **五态模型**：每个字段都带 `status`（`ready` / `empty` / `not_connected` / `delayed` / `no_access`）
   与 `source` / `asOf`；`no_access` 的 `value` 恒为 `null`。
3. **统计口径不取当页**：列表页的状态与覆盖度分布由后端全量 `GROUP BY` 得出，
   两个分布的求和恒等于 `total`，与「当前页 20 条」无关。

其它约定：底表**不加外键**（服务层 `$queryRaw` 关联）；模糊检索用 `ILIKE`；
页面与 Agent 只访问 NestJS，不直连数据库；`days` 参数 clamp 到 7–90，越界回落默认值而非报错。

---

## 部署到阿里云

单机 Docker Compose（Nginx + API + PostgreSQL，公网 IP + 80，暂未配域名/HTTPS）：

```bash
# ECS 上（首次）
curl -fsSL https://raw.githubusercontent.com/WinnieHan-root/product360/main/scripts/server-bootstrap.sh -o /tmp/b.sh
sudo bash /tmp/b.sh
git clone https://github.com/WinnieHan-root/product360.git /opt/product360
cd /opt/product360
cp deploy/.env.production.example deploy/.env && chmod 600 deploy/.env && vi deploy/.env
INIT_DB=1 bash scripts/release.sh

# 后续发版（本地 push 之后）
cd /opt/product360 && VERSION=2026.11.03 bash scripts/release-git.sh
```

完整步骤（安全组、验收清单、备份、回滚、域名与 HTTPS、排障）见 **[`docs/deploy-aliyun.md`](docs/deploy-aliyun.md)**。

---

## 常用命令

| 命令 | 作用 |
|---|---|
| `pnpm dev` | 构建 shared 后并行启动 api + web |
| `pnpm db:push` / `db:sync` / `db:seed` | 建表 / 灌样例数据 / 建账号 |
| `pnpm deploy:up` / `deploy:down` / `deploy:logs` | 本地起停生产编排、看 api 日志 |
| `pnpm deploy:pack` | 打离线部署包到 `dist-deploy/`（ECS 不能出网时用） |
| `scripts/release.sh` | 服务器上构建 + 初始化 + 启动 + 冒烟 |
| `scripts/release-git.sh` | 服务器上 `git pull` 后发版 |

---

## 文档索引

| 文档 | 内容 |
|---|---|
| [`docs/商品中心MVP_PRD.md`](docs/商品中心MVP_PRD.md) | 产品需求（V2.0，两份分期的上游依据） |
| [`docs/align-source-model.md`](docs/align-source-model.md) | **数据契约**：13 张表、字段映射、接口出入参、口径说明 |
| [`docs/deploy-aliyun.md`](docs/deploy-aliyun.md) | 阿里云部署手册（首次部署 / 发版 / 回滚 / 备份 / HTTPS / 排障） |
| [`docs/deploy-runbook.md`](docs/deploy-runbook.md) | **逐段粘贴式执行手册**（JumpServer 网页终端、每步带期望输出与失败排查） |
| [`docs/20261026-visual-review.md`](docs/20261026-visual-review.md) | 视觉评审与实施记录（P0 token 体系、P1 布局重排） |
| [`docs/candidate_tables_ddl.sql`](docs/candidate_tables_ddl.sql) | 源表 DDL 参考 |
| `docs/sample_exports/` | 8 张源表的样例导出（CSV），`pnpm db:sync` 的数据源 |

---

## 已知限制

| 限制 | 说明 |
|---|---|
| 数据是样例导出 | `docs/sample_exports` 为抽样（每表 ≤2000 行），30 天销量只有 2 天有值，趋势图会出现断裂段——这是**如实呈现**，不是 bug |
| 部分商品图不显示 | 源表 `spu_image` 混杂公网 URL、相对 key、已过期的内网预签名 URL；第一期不做图片代理 |
| 无 Prisma migration | 走 `db push`，schema 变更无版本历史；第二期上写入前补齐 |
| 单机单点 | 无高可用；需要 HA 时迁 RDS + SLB |
| Web 首屏 JS 约 2.2 MB | 未做路由级拆包 |
| 演示账号密码公开 | 仓库为 public，上线前必须修改 |

---

## 说明

本项目代码与数据仅用于内部 MVP 演示，`docs/sample_exports` 中的样例数据不代表真实经营数据。

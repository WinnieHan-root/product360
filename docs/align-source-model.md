# align-source-model 契约（第一期冻结版）

> 本文是 `align-source-model` 的实现契约。schema、加载器、四个 Service、前端页面全部以此为准。
> 数据源：`docs/sample_exports/*.csv`（不再从 StarRocks 同步）。每表独立抽样 1000 行。

## 0. 不可违反的规则

1. **请求链路不连 StarRocks**，页面只经 NestJS；只读 `PostgreSQL` 底表。
2. **不引入 ES / Redis**；模糊检索用 PostgreSQL `pg_trgm` 的 `ILIKE` / `similarity`。
3. **字段只能来自源表**。源表没有的字段一律 `not_connected`，**不得造字段、不得填 0**。
4. **`no_access` 的 `value` 必须为 `null`**，不能是 `0`。
5. 第一期**只读**。不出现编辑、草稿、审核、发布、批量操作、渠道回写入口。
6. 所有数值字段带 `source`（来源表中文名）与 `asOf`（该源表最近成功批次的 `source_ds`）。

## 1. 数据源与接入结论

每张源表有两份导出，加载器按自然键合并去重（`SAMPLE_EXPORT_DIR` 可覆盖目录）：
- `X.csv`：随机全量抽样；
- `X_breast_pump.csv`：吸奶器专题导出（`dim_pd_spu_info_df_breast_pump.csv` 仅 303 行，其余 1000 行）。

| 源文件 | 行数（base + breast_pump） | 口径 | 是否接入 |
|---|---|---|---|
| `dim_pd_spu_info_df.csv` | 1000 + 303（重叠 236） | 商品主档，1 SPU 1 行 | ✅ `pd_spu`（1067 行） |
| `dim_pd_sku_info_df.csv` | 1000 + 1000 | SKU 主档 | ✅ `pd_sku`（1979 行） |
| `dim_sal_sku_info_df.csv` | 1000 + 1000 | 渠道商品编码（ASIN / 平台 SKU） | ✅ `sal_sku_code`（1999 行） |
| `dws_sal_sku_statistics_td_df.csv` | 1000 + 1000 | 销售按订单日汇总 | ✅ `sal_sku_day`（1999 行） |
| `dwb_scm_stock_channel_df.csv` | 1000 + 1000 | 渠道仓库存 | ✅ `scm_stock`（1461 行） |
| `dws_cs_voc_nps_review_df.csv` | 1000 + 1000 | 评论 + NPS + 体验因子（含竞品） | ✅ `voc_review_day` / `voc_nps_tag` / `voc_nps_sentiment` / `voc_competitor` |
| `dwb_cs_voc_record_channel_hf.csv` | 1000 + 1000 | 客服工单 / 退货留言 | ✅ 仅 `voc_ticket_topic`（主题分类） |
| `dwb_sal_return_sku_df.csv` | 1000 + 1000 | 退货明细 | ❌ 第一期不同步（规划明确） |
| `ads_sal_sku_online_listing_df.csv` | 1000（无 `_breast_pump` 变体） | 全渠道在线商品宽表，1 listing 1 行 | ✅ `sal_sku_online_listing`（1000 行） |

### 样例数据已知事实（实现时必须按此处理，不要试图「修好」数据）

| 事实 | 影响 |
|---|---|
| 各表独立抽样，`spu_code` 交集仍然稀疏：并集 1067 个 SPU 中，SPU↔SKU 444、SPU↔渠道编码 253、SPU↔销量 112、SPU↔自有口碑 76，**四者齐全 35 个**，571 个 SPU 无任何明细 | 大量页面自然呈现 `not_connected` / `empty`。列表默认按 `coverage` 倒序，让有数据的先出现。覆盖率分布：0→571 / 1→253 / 2→132 / 3→76 / 4→35 |
| `dws_sal_sku_statistics_td_df` 只有 1 个 `ds`(2026-10-26)，`order_date` 跨 2022-05-13 ~ 2026-10-26，**近 30 天 70 行** | 「近 30 天」按 `order_date >= max(order_date) - 29d` 过滤；样例下数值会很小，属数据事实 |
| `dwb_scm_stock_channel_df`：`in_stock_qty` 513 行 > 0（合计 104002）、`on_way_qty` 268 行 > 0（合计 163784），另有多行为 0 | 0 是有效值，必须显示 `ready` + 0，不得判成 `empty` |
| `dwb_cs_voc_record_channel_hf.rating` **全为 0**，`sentiment` / `tag_status` **全空** | 工单表**只用于主题分类**，不参与星级、不参与情感占比 |
| `dws_cs_voc_nps_review_df.data_source` 全为 `competitor`，`is_own_brand=1` 共 1052 行、覆盖 81 个 SPU（其中 76 个在主档内），聚出 896 个「SPU × 日期」桶；其余归竞品（102 个「品牌 × 型号」） | 自有评论口径 = `is_own_brand = 1`；竞品口径 = `is_own_brand = 0`（聚出 102 个「品牌 × 型号」） |
| `pd_spu.spu_state` 分布：0→154 / 1→270 / 2→356 / 3→249 / 5→38 | 五态标签必须齐全，未映射值不接受 |
| 源表**没有** UPC / EAN / GTIN / Item ID | 变体外部编码只展示 ASIN 与平台 SKU，其余三项 `not_connected` |
| 源表**没有** 竞品价格 / BSR / 搜索关键词 | 三个模块整体不实现（规划也不做），前端不渲染 |
| 源表**有** 包装尺寸 `spec_product_*` / `spec_carton_*` 与建议售价 | 必须展示（此前误判为未接入） |

## 2. 底表映射

| 底表 | 源文件 | 粒度 / 唯一键 |
|---|---|---|
| `pd_spu` | `dim_pd_spu_info_df` | `spu_code` 唯一 |
| `pd_sku` | `dim_pd_sku_info_df` | `sku_code` 唯一 |
| `sal_sku_code` | `dim_sal_sku_info_df` | `(channel, site, shop_code, sale_sku_code, sku_code)` |
| `sal_sku_online_listing` | `ads_sal_sku_online_listing_df` | `(channel, site, shop_code, msku)` |
| `sal_sku_day` | `dws_sal_sku_statistics_td_df` | `(order_date, platform, shop, country_code, platform_sku)` |
| `scm_stock` | `dwb_scm_stock_channel_df` | `(channel_code, country_code, sku_code, warehouse_code)` |
| `voc_review_day` | `dws_cs_voc_nps_review_df` where `is_own_brand=1` | `(spu_code, review_date)` |
| `voc_nps_tag` | 同上 `nps_tag_list` | `(spu_code, tag_name, sentiment)` |
| `voc_nps_sentiment` | 同上 `nps_overall_sentiment` | `(spu_code, sentiment)` |
| `voc_ticket_topic` | `dwb_cs_voc_record_channel_hf` | `(spu_code, topic)` |
| `voc_competitor` | `dws_cs_voc_nps_review_df` where `is_own_brand=0` | `(brand_name, voc_model)` |
| `sync_batch` | 加载器写入 | `batch_id` + `source_table` |

## 3. 加载清洗规则

通用：
- 空串 / `"None"` / `"null"` / `"NaN"` → `NULL`（数值列为 `null`，文本列为 `null`）。
- 日期：`YYYY-MM-DD` 或 `YYYY-MM-DD HH:mm:ss` → `Date`；非法或空 → `null`。`ds` 缺失时取文件内 `ds` 众数。
- JSON 列（`extra_info` / `attr_info` / `tag_info` / `model_info` / `series_info` / `nps_tag_list`）解析失败 → `NULL`，**不抛错跳过该行**。
- 数值列 `0` 是有效值（尤其 `in_stock_qty`、`sale_qty`），只有空串才是 `null`。
- 幂等：每次加载先 `TRUNCATE` 目标底表（除 `users` / `user_scopes`），单事务内写入，最后写 `sync_batch`。
- 失败：`sync_batch.status = 'failed'` 并写 `message`；已写入的数据保留（不半途回滚整批，按表粒度记成功/失败）。

逐表：
- `pd_spu`：`spu_state_desc` 空 → `待上架`，`spu_state` 空 → `1`。`spu_model_name` 取 `model_info.model_name`（无则取该 SPU 任一 `pd_sku.spu_model_name`）。`tag_info` 原样入 `jsonb`。
- `pd_sku`：`attr_info` 由 `extra_info` 中的属性数组提取为 `jsonb`（结构见源文件，不重建）。
- `sal_sku_code`：`sale_sku_code` 即平台 SKU；`suggest_price` 取 `sku_suggest_price`。
- `sal_sku_online_listing`：`channel` / `msku` / `listing_status` 任一为空 → 丢弃；`has_*` 与 `content_item_cnt` 是源端已算好的标记，**原样透传不重算**；`pt` 列（任务执行时间戳）不落库。
- `sal_sku_day`：按唯一键聚合 `sum(sale_qty)` / `sum(order_qty)` / `sum(sales_amount_usd)` / `sum(after_sale_replacement_qty)`。`sale_qty` 为整型，四舍五入。
- `scm_stock`：按唯一键聚合 `sum(in_stock_qty)` / `sum(on_way_qty)`。
- `voc_review_day`：仅 `is_own_brand='1'` 且 `spu_code` 非空；按 (`spu_code`,`review_date`) 汇总 `avg(rating)`、`count(*)`。
- `voc_nps_tag`：仅 `is_own_brand='1'`；解析 `nps_tag_list`（元素含 `tag_name` / `tag_sentiment`），按 (`spu_code`,`tag_name`,`sentiment`) 计数；`ratio = count / 该 SPU 打标总数`。
- `voc_nps_sentiment`：仅 `is_own_brand='1'`；`bucket` 取 `sentiment_bucket`，`sentiment` 取 `nps_overall_sentiment`；`ratio = count / 该 SPU 评论总数`。
- `voc_ticket_topic`：`spu_code` 非空者；主题取 `classification_cn`（空则回退 `effective_classification_tag`，再空则 `未分类`）；按 (`spu_code`,`topic`) 计数；`ratio = count / 该 SPU 工单总数`。`voc_type` 取该组众数。
- `voc_competitor`：`is_own_brand <> '1'`；`voc_model` 为空 → `未匹配`；按 (`brand_name`,`voc_model`) 汇总 `avg(rating)`、`count(*)`。

### 3.1 `pd_spu` 预聚合列（加载阶段算好）

| 列 | 口径 |
|---|---|
| `sku_count` | `pd_sku` 中同 `spu_code` 的行数 |
| `channel_count` | `sal_sku_code` 中同 `spu_code` 的 distinct `channel` 数 |
| `market_countries` | `sal_sku_day` 中同 `spu_code` 的 distinct `country_code`（剔除空值，升序） |
| `sales_30d_qty` / `sales_30d_usd` | `sal_sku_day` 中 `order_date >= max(order_date) - 29d` 且同 `spu_code` 的 `sum(sale_qty)` / `sum(sales_amount_usd)` |
| `in_stock_qty` / `on_way_qty` | 经 `pd_sku.sku_code` 关联 `scm_stock` 求和 |
| `review_count` / `rating_avg` | `voc_review_day` 中同 `spu_code` 的 `sum(review_count)` / 加权平均星级 |
| `coverage` | `sku_count>0` + `channel_count>0` + `has_sales`（`sal_sku_day` 中存在该 SPU 的销售行） + `review_count>0`，各计 1，范围 0–4 |

### 3.2 SQL 版清洗（两套方言，各管一段）

清洗口径除了 TS loader，还有两套 SQL 实现，**分属不同方言、不同用途**：

| 目录 | 方言 | 用途 |
|---|---|---|
| `sql/dataphin/` | **StarRocks** | **生产链路**：Dataphin 计算任务读数仓源表 → 写 `p360_*` 中间表 → 集成任务同步到 PG |
| `sql/sync/` | PostgreSQL | 离线回归基线：本地 CSV → staging → 清洗，用于证明与 TS loader 逐值等价 |

- 生产入口：`sql/dataphin/README.md`（任务依赖顺序、`${bizdate}` 分区写法、集成任务同名映射、
  `00_pg_patch.sql` 给 `id` 补 `DEFAULT gen_random_uuid()`、未在真实 SR 实例上的风险点）
- 回归入口：`sql/sync/README.md`；验证命令 `pnpm db:sync:verify` 会重建临时库、全量跑一遍
  PG 版 SQL，再与 `pnpm db:sync` 的结果逐表逐列比对（当前 10 张表全部一致，
  含 `coverage` 分布 571/253/132/76/35）
- SR 版是由 PG 版逐条翻译而来，翻译**引入的唯一已知差异**：`sal_sku_code` 差 1 行
  （源表无 `update_time`，SR 版按 `sal_listing_time DESC` 取代 CSV 行序），详见 `sql/dataphin/README.md` §6
- 三处并存（TS loader / `sql/sync/` / `sql/dataphin/`），**改口径必须同时改三处**；差异以本节规则为准

实现时按代码对齐的两处细节（文档早前写法有偏差，以代码/SQL 为准）：

- 竞品口径是 `is_own_brand <> '1'`（不是 `= '0'`），空值行也计入竞品
- `coverage` 的第 3 项是「存在销售行」而非「销量 > 0」

## 4. API 契约

统一：全局前缀 `/api`，`Authorization: Bearer <jwt>`；JSON 字段 camelCase。

### 4.1 认证

```
POST /api/auth/login  { email, password } → { accessToken, user: { id, name, email, role, roleLabel, canViewCommercial, scopes: [{scopeType, scopeCode}] } }
GET  /api/auth/me                        → 同上 user
```

### 4.2 元数据

```
GET /api/meta/brands          → { items: [{ code, name, spuCount }] }   // 只返回当前用户有权限品牌；无 scope 限制时为全量
GET /api/meta/categories      → { items: [{ code, name, spuCount }] }   // 一级类目（扁平，保留兼容）
GET /api/meta/categories/tree → { levels, total, tree: [CategoryNode] } // 四级类目树（前端用这个）
```

```json
// CategoryNode：children 仅在真有子节点时出现（不挂空数组，避免画出假的展开箭头）
{ "value": "CA002", "label": "服纺", "count": 282,
  "children": [
    { "value": "CA002003", "label": "内衣", "count": 244,
      "children": [{ "value": "CA002003021", "label": "文胸", "count": 206 }] }
  ] }
```

- `value` 是该级**类目身份**：`COALESCE(编码, 名称)`，与列表筛选的匹配口径完全同源。
- 树的聚合**在 scope 过滤之后做**，`employee` 角色看不到无权类目的名字；`count` 是子树内 SPU 数之和。
- 只做 L1~L4：`category_code_level5` 在源表 100% 为空，不暴露。
- 一次返回全树（生产 686 节点、深度 4），**不需要懒加载**。
- **已知限制**：生产 1067 个 SPU 里 123 行 `category_code_level*` 为空、只有名称，导致同级出现同名节点
  （如「服纺」既有 `CA002`(282) 又有 `服纺`(30)）。这是源表编码缺失的如实反映，前端不做合并也不猜编码；
  上游补齐这 123 行的类目编码后自然消失。`name ↔ code` 实测严格 1:1，无同码异名或同名异码的歧义。

### 4.3 商品列表

```
GET /api/products?q=&brand=&category=&market=&state=&lifecycle=&sort=coverage&page=1&pageSize=20
```

`q`：精确优先命中 `spu_code` / `sku_code` / `asin` / 平台 SKU（`sal_sku_code.sale_sku_code`）；否则 `spu_name` / `spu_name_en` 模糊（`ILIKE %q%`）。
`state`：`pd_spu.spu_state` 的 0/1/2/3/5。
`market`：市场二字码，命中 `pd_spu.market_countries` 的任一元素（`= ANY(...)`）。空数组的 SPU 在任何市场筛选下都不命中；不传或传空串时不过滤。
`category`：类目路径，`/` 分隔、1~4 段，第 N 段命中第 N 级类目（`COALESCE(编码, 名称)`）。
每段都 AND 上级，**天然防跳级**：`category=CA002003`（把二级编码塞进第一段）返回 0 条，不会误命中。
单段时与旧的一级类目筛选完全等价，既有链接无需迁移。超过 4 段只取前 4 段。
`lifecycle`：运营生命周期，四值之一 `selling` / `prelaunch` / `clearance` / `retired`。见 §4.3.1。
`sort`：`coverage`(默认) / `updateTime` / `sales30d` / `reviewCount`，均倒序，次级排序 `spuCode asc`。

```json
{
  "items": [{
    "spuCode": "SPU000067",
    "spuName": "……",
    "spuNameEn": "……",
    "spuImage": "https://… | null",
    "brandCode": "Momcozy",
    "categoryNameL1": "服纺",
    "categoryPath": "服纺 / 文胸 / 无钢圈",
    "spuLevelNew": "A",
    "spuState": 2,
    "spuStateLabel": "可销售",
    "skuCount": 3,
    "channelCount": 2,
    "marketCountries": ["CA", "US"],
    "sales30dUsd": { "status": "ready", "source": "销售日汇总", "asOf": "2026-10-26", "value": 1234.56 },
    "reviewCount": 12,
    "coverage": 4,
    "coverageDimensions": ["sku", "channel", "sales", "voc"],
    "lifecycleStage": "selling",
    "lifecycleStageLabel": "在售",
    "updateTime": "2026-10-26T00:00:00.000Z"
  }],
  "total": 1000,
  "page": 1,
  "pageSize": 20,
  "summary": { "total": 1000, "withDetail": 405, "fullCoverage": 35, "withSales": 112, "withReview": 76 },
  "breakdown": {
    "state": [{ "code": "0", "label": "开发中", "count": 154 }, { "code": "1", "label": "待上架", "count": 270 }],
    "coverage": [{ "level": 0, "count": 571 }, { "level": 1, "count": 253 }],
    "markets": [{ "code": "US", "count": 93 }, { "code": "CA", "count": 27 }],
    "lifecycle": [
      { "key": "selling", "label": "在售", "count": 342 },
      { "key": "prelaunch", "label": "未上市", "count": 424 },
      { "key": "clearance", "label": "清仓中", "count": 14 },
      { "key": "retired", "label": "已退市", "count": 287 }
    ]
  },
  "scope": { "mode": "all|brand|category|mixed|none", "brands": ["Momcozy"], "categories": [] }
}
```

### 4.3.1 生命周期口径

`pd_spu.lifecycle_stage` 是**加载期算好的列**（`loader.ts` 的 `buildAggregates()` / `sql/sync/90_aggregates.sql`
/ `sql/dataphin/11_pd_spu.sql` 三处同语义），请求期直接读列，不跨表推导。判定优先级从上到下、第一命中即定级：

| 阶段 | key | 判定 | 实测（1067 SPU） |
|---|---|---|---|
| 已退市 | `retired` | `spu_state_desc ∈ {已下架, 已取消}` | 287 |
| 清仓中 | `clearance` | 存在 `pd_sku.sku_state_desc = '清仓中'` 的 SKU | 14 |
| 未上市 | `prelaunch` | `spu_state_desc ∈ {开发中, 待上架}` | 424 |
| 在售 | `selling` | 其余（`可销售`） | 342 |

四桶互斥且合计 1067 = 全量，**没有 NULL 兜底路径**（源表 `spu_state_desc` 为空的行在 loader 里已归入「待上架」）。

**刻意不引入 `listing_time`**：生产库覆盖率只有 76%（814/1067），空值只说明历史没登记上架时间，
不代表「未上市」。拿它做 OR 条件会把 200+ 个在售商品误标成未上市。

**已知取舍**：19 个 SPU 主数据已「已下架」但仍有 SKU 处于「清仓中」，按优先级归入「已退市」（主数据终态优先）。
如果运营侧希望这类商品显示「清仓中」（提示还有货要清），把 `retired` 和 `clearance` 两条换个顺序即可，
改三处 SQL/TS 的 CASE 顺序 + `LIFECYCLE_STAGES` 的展示顺序。

`breakdown.lifecycle` 固定返回四个桶（缺的补 0），**不受 `lifecycle` 自身筛选收窄以外的例外** ——
即选了「清仓中」后，这四项会变成 14/0/0/0，与 `state`/`coverage` 的联动行为一致（只有 `markets` 是例外，见 §4.3）。

- `pageSize` 只接受 20 / 50 / 100，其它值回落 20；`page` 最小 1。越界参数**回落默认值**，不返回 400。
- `sales30dUsd` 是商业敏感字段：`canViewCommercial=false` 时为 `{ status: "no_access", source: null, asOf: null, value: null }`（列表接口同样处理）。
- `q` 的精确匹配两侧 `upper()` 归一，大小写不敏感但仍属精确匹配；未命中精确集才走 `ILIKE`（`\ % _` 已转义）。
- `brand` / `category` 取 `GET /api/meta/*` 返回的 `code`。类目身份 = 一级类目编码，编码为空时退化为一级类目名称（样例中有 118 个 SPU 只有名称）。
- `summary` 与 `breakdown` 全部**在同一过滤条件下统计**（`q` / `brand` / `category` / `market` / `state` 都会联动）：
  - `withDetail` = `coverage > 0` 的数量（「其中 N 个有明细」）。
  - `fullCoverage` = `coverage = 4`（SKU / 渠道 / 销量 / 口碑四项齐全）。
  - `withSales` = `sales_30d_usd IS NOT NULL`；`withReview` = `review_count > 0`。
  - 两个分布的总和恒等于 `summary.total`，缺桶补 0，前端不需要自己算比例。
- `breakdown.state` 按 `spu_state` 分组，顺序固定为 0/1/2/3/5（枚举外的值排在末尾）；`breakdown.coverage` 按 `coverage` 0–4 分组。
- `breakdown.markets` 由 `unnest(market_countries)` 聚合，按 `count desc` 排序，**只列真实出现的市场码、不补 0**（没出现就是没有该市场的商品）。
  **唯一例外**：它不受 `market` 自身筛选收窄（否则选完只剩一个选项、无法切换），但其它筛选条件照常联动。`state` / `coverage` 仍吃完整 where，保持既有语义。
- 这两个分布是**全量口径**，与当前页 20 条无关；列表页的「状态分布」图因此不会画出假分布。

### 4.4 概览页

```
GET /api/products/:spu/overview
```

```json
{
  "header": {
    "spuCode": "SPU000067",
    "spuName": "……",
    "spuNameEn": "……",
    "spuImage": "url | null",
    "brandCode": "Momcozy",
    "categoryPath": "服纺 / 文胸 / 无钢圈",
    "spuLevelNew": "A",
    "spuStateLabel": "可销售",
    "listingTime": "2023-05-01",
    "asOf": "2026-10-26",
    "source": "商品主档",
    "metrics": {
      "sales30dUsd": { "status": "ready", "source": "商品主档", "asOf": "2026-10-26", "value": 447.44 },
      "ratingAvg": { "status": "ready", "source": "商品主档", "asOf": "2026-10-26", "value": 2.981 },
      "skuCount": { "status": "ready", "source": "商品主档", "asOf": "2026-10-26", "value": 40 },
      "channelCount": { "status": "ready", "source": "商品主档", "asOf": "2026-10-26", "value": 4 }
    }
  },
  "fields": [
    { "key": "spuModelName", "label": "型号", "field": { "status": "ready", "source": "商品主档", "asOf": "2026-10-26", "value": "SZ001" } },
    { "key": "spuProductTypeDesc", "label": "产品类型", "field": { … } },
    { "key": "productLineName", "label": "产品线", "field": { … } },
    { "key": "gtmName", "label": "GTM", "field": { … } },
    { "key": "productLeaderName", "label": "产品负责人", "field": { … } },
    { "key": "sellingPoint", "label": "核心卖点", "field": { … } },
    { "key": "spuDesc", "label": "商品描述", "field": { … } }
  ],
  "tags": [
    { "key": "senceTagName", "label": "场景标签", "field": { … } },
    { "key": "fmcgTagName", "label": "快消标签", "field": { … } },
    { "key": "iotTagName", "label": "IoT 标签", "field": { … } },
    { "key": "isElectricalDesc", "label": "电器属性", "field": { … } },
    { "key": "classTagName", "label": "类别标签", "field": { … } },
    { "key": "categoryTagName", "label": "类目标签", "field": { … } }
  ],
  "packaging": {
    "product": { "status": "ready", "source": "SKU 主档", "asOf": "…", "value": { "length": 12.5, "width": 8, "height": 3, "weight": 0.42, "netWeight": 0.38, "lengthUnit": "cm", "weightUnit": "kg" } },
    "carton":  { "status": "not_connected", "source": "SKU 主档", "asOf": "…", "value": null }
  },
  "variants": [{
    "skuCode": "HF008-BL11XL",
    "skuName": "……",
    "skuNameEn": "……",
    "skuImage": "url | null",
    "skuStateLabel": "在销售",
    "suggestPrice": { "status": "ready", "source": "SKU 主档", "asOf": "…", "value": 39.99 },
    "currency": "USD",
    "codes": [{
      "channel": "amazon", "channelName": "Amazon", "site": "US", "shopCode": "Momcozy",
      "platformSku": "HF008-BL11XL-US", "asin": "B0XXXXXXX"
    }],
    "unavailableCodes": [
      { "label": "UPC", "status": "not_connected" },
      { "label": "EAN", "status": "not_connected" },
      { "label": "GTIN", "status": "not_connected" },
      { "label": "Item ID", "status": "not_connected" }
    ]
  }],
  "variantsMeta": { "total": 3, "source": "SKU 主档", "asOf": "2026-10-26" }
}
```

> 单位换算是**展示层**行为：源表 `spec_product_length` 为厘米、`spec_product_weight` 为千克，接口原样返回数值 + `lengthUnit` / `weightUnit` 字段，前端拼接单位。`product` 取「第一个填了主规格尺寸的 SKU」，`carton` 另有 `num`（装箱数）。
>
> `header.metrics` 是「跨页签指标带」用的一组摘要，直接读 `pd_spu` 的预聚合列（`sales_30d_usd` / `rating_avg` / `sku_count` / `channel_count`，与列表页同源），不额外查表、不重算。`sales30dUsd` / `ratingAvg` 属商业字段：`canViewCommercial=false` 时同样返回 `no_access` + `value: null`，前端显示「无权限」而不是 0。
>
> 变体 `codes` 严格按 `pd_sku.sku_code = sal_sku_code.sku_code` 关联：`sal_sku_code` 中只有 `spu_code` 而匹配不到 SKU 的编码行**不挂到任何变体**（样例中这类占多数），由渠道页完整展示。变体顺序为「有渠道编码的在前」。

### 4.5 渠道页

```
GET /api/products/:spu/channels?days=30      // days ∈ [7,90]，默认 30
```

窗口：`max(order_date)` 往前 `days` 天（含）。

```json
{
  "window": { "days": 30, "from": "2026-09-27", "to": "2026-10-26" },
  "summary": [
    { "key": "channelCount", "label": "覆盖渠道", "field": { "status": "ready", "source": "渠道商品编码", "asOf": "…", "value": 2 } },
    { "key": "saleQty", "label": "近 30 天销量", "field": { … } },
    { "key": "salesAmountUsd", "label": "近 30 天销售额(USD)", "field": { … } },
    { "key": "inStockQty", "label": "在库", "field": { … } },
    { "key": "onWayQty", "label": "在途", "field": { … } }
  ],
  "rows": [{
    "channel": "amazon", "channelName": "Amazon", "site": "US", "shopCode": "Momcozy",
    "asin": "B0XXXX", "platformSku": "…", "skuCode": "…",
    "listingStatus": { … }, "suggestPrice": { … },
    "saleQty": { … }, "salesAmountUsd": { … },
    "inStockQty": { … }, "onWayQty": { … }
  }],
  "trend": {
    "metrics": ["saleQty", "salesAmountUsd"],
    "labels": ["2026-09-27", "…"],
    "saleQty": [null, 3, …],
    "salesAmountUsd": [null, 89.9, …],
    "status": "ready | empty | not_connected | no_access",
    "source": "销售日汇总",
    "asOf": "2026-10-26",
    "note": "源表无挂牌价日快照，不提供价格趋势"
  }
}
```

- 金额/销量/价格/库存字段在无 `canViewCommercial` 时统一 `{ status: "no_access", value: null }`。`channelCount` 不属商业敏感，始终可见。
- `days` 越界（<7 或 >90）回落 30，返回 `window.days` 为实际生效值。
- `rows` 的粒度：`sal_sku_day` 按 (channel, site, shop, platformSku) 聚合 + 左连 `sal_sku_code`、`scm_stock`，编码行优先（渠道名/挂牌状态/建议售价来自编码表）。无销量行但有编码行的组合也要出现（销量为 `empty`）。
- `trend` 按日补齐整窗日期序列，**源表当日无该商品统计行时为 `null`**（不是 0）；前端只把 `null` 当空柱处理。窗口内全无销量 → `status: "empty"`。
- 行级库存按 (渠道行 SKU, 渠道) 匹配；`summary.inStockQty` / `onWayQty` 按该 SPU 的全部 SKU（`pd_sku` ∪ `sal_sku_code`）汇总。样例各表独立抽样，行级与合计可能不同步，这是数据事实而非缺陷。

#### 4.5.1 在线商品上架矩阵（P2-4）

```
GET /api/products/:spu/channels/listings?status=online
```

`status` ∈ `online`（默认）/ `offline` / `draft` / `deleted` / `all`；越界或非法值 → **400**（与 `lifecycle` 一致，用 `@IsIn`）。

数据源是 `ads_sal_sku_online_listing_df`（→ PG `sal_sku_online_listing`），与上面 `GET .../channels` 用的
`dim_sal_sku_info_df` / `dws_sal_sku_statistics_td_df` **是两个数据源**，同一商品两边的「渠道数」可以不同，
界面上必须分别标注口径，不能相互印证。

```json
{
  "spuCode": "SPU001001001003016",
  "status": "online",
  "counts": { "total": 225, "online": 16, "offline": 66, "draft": 143, "deleted": 0 },
  "channels": [
    { "channel": "shopify", "listingCount": 7, "shops": 3, "sites": ["CA", "US"],
      "onlineCount": 7, "fullContentCount": 5, "contentAvg": 4.7,
      "missing": { "title": 0, "image": 0, "description": 2, "price": 0 } }
  ],
  "items": [
    { "channel": "shopify", "site": "CA", "shopCode": "shopifymomcozy_US",
      "msku": "BP148-MR00BA-C", "externalId": "50983687258345", "externalIdType": "product_id",
      "parentExternalId": null, "skuCode": "…",
      "title": { "status": "ready", "source": "全渠道在线商品", "asOf": "2026-11-08", "value": "…" },
      "descriptionSummary": { … }, "mainImageUrl": { … },
      "listingStatus": "online", "listingStatusRaw": "active",
      "operatorName": "周颖", "currencyCode": "USD",
      "listPrice": { … }, "salePrice": { … }, "rating": null,
      "contentItemCnt": 5,
      "contentFlags": { "title": true, "mainImage": true, "description": false, "price": true, "status": true },
      "productLink": "…", "srcTable": "dwb_sal_sku_shopify_df" }
  ],
  "coverage": {
    "channels": ["amazon", "shopify", "shopee", "lazada", "aliexpress", "…"],
    "srcTables": ["dwb_sal_sku_amazon_df", "dwb_sal_sku_jijia_listing_df", "dwb_sal_sku_shopify_df"],
    "note": "覆盖 Amazon、Shopify、Shopee、Lazada、Mercado Libre、Shein、AliExpress 等渠道，仍非公司全部销售渠道",
    "status": "ready", "source": "全渠道在线商品", "asOf": "2026-11-08"
  }
}
```

**`listing_status` 四值口径（源端已归一，前端不再推导）**

| 值 | 含义 | 实测行数 | 说明 |
|---|---|---|---|
| `online` | 在线可售 | 594 | |
| `offline` | 已下架 | 957 | 描述与主图多半不维护，是正常现象 |
| `draft` | 草稿 | 416 | **仅 Shopify**：店铺里已建好但未发布。内容多半已填满，不能并入 `offline` |
| `deleted` | 已删除 | 33 | 源端自己打的标，**不是从 `listing_status_raw` 推出来的** |

`listing_status_raw` 保留源端原值（`上架\|正常` / `下架\|正常` / `下架\|发布中` / `AVAILABLE_FOR_SALE` /
`NOT_FOR_SALE` / `active` / `draft`），只用于 Tooltip 解释，不参与判定。

**`deleted` 与 `offline` 的 raw 值完全相同（都是 `下架|正常`）** —— 所以「已删除」不能用 raw 值区分，
必须直接用源端的 `listing_status`。这一条纠正了 v2 设计里的阻塞项。

**业务粒度含 `external_id`**

去重键 = `channel | site | shop_code | msku | external_id`。必须带 `external_id`：
同一个内部 SKU 在 Shopify 会被重复建成多个商品（各有独立 `product_id`），
只按前四列去重会丢掉 329/2000 行（实测 2000 行 → 1671）。带上后 **2000/2000 唯一**。
同时 amazon 侧一个 ASIN 挂多个 msku 变体也能靠 `msku` 区分，两个方向都不丢。

**布局约束（from 实测）**

单个 SPU 的 listing 数 1~225（中位 2），渠道×站点组合 1~36（中位 1）。
所以矩阵 **行 = 指标、列 = 渠道**（最多 11 列，横向滚动），站点只在表头缩略；
明细表独立分页（20/页）。不做「列 = 渠道×站点」，36 列不可读。

**抽样造成的孤儿引用**：`sal_sku_online_listing` 里有 44 个 `spu_code` 在 `pd_spu` 中不存在。
`pd_spu` 只抽了 1067 行，而 listing 表引用了更大范围的 SPU —— 是抽样伪影，不是脏数据，
生产环境全量同步后自然消失。

### 4.6 口碑页

```
GET /api/products/:spu/external?days=30
```

```json
{
  "review": {
    "ratingAvg": { "status": "ready", "source": "评论与 NPS", "asOf": "2026-10-26", "value": 4.2 },
    "reviewCount": { … },
    "sentiments": [
      { "bucket": 1, "sentiment": "强烈不推荐", "count": 2, "ratio": 0.08 },
      { "bucket": 2, "sentiment": "不喜欢", "count": 5, "ratio": 0.19 },
      { "bucket": 3, "sentiment": "一般", "count": 4, "ratio": 0.15 },
      { "bucket": 4, "sentiment": "喜欢", "count": 10, "ratio": 0.38 },
      { "bucket": 5, "sentiment": "强烈推荐", "count": 5, "ratio": 0.19 }
    ],
    "sentimentStatus": "ready | empty | not_connected",
    "tags": [{ "tagName": "质量感知", "sentiment": "正向", "count": 8, "ratio": 0.32 }],
    "tagsStatus": "ready | empty | not_connected",
    "trend": {
      "labels": ["2026-09-27", "…"],
      "ratingAvg": [4.0, null, …],
      "reviewCount": [1, null, …],
      "status": "ready | empty | not_connected | no_access",
      "source": "评论与 NPS",
      "asOf": "2026-10-26"
    }
  },
  "tickets": {
    "status": "ready | empty | not_connected",
    "total": 12,
    "topics": [{ "topic": "没有吸力", "vocType": "客服工单", "ticketCount": 4, "ratio": 0.33 }],
    "source": "服务工单",
    "asOf": "2026-10-26",
    "note": "工单表 rating 恒为 0，只用于主题分类，不参与星级"
  },
  "competitors": {
    "status": "ready | empty | not_connected",
    "rows": [{ "brandName": "Momcozy", "vocModel": "SZ001", "ratingAvg": 4.1, "reviewCount": 37 }],
    "source": "评论与 NPS",
    "asOf": "2026-10-26",
    "note": "仅统计 is_own_brand = 0 的竞品行，自有品牌不混入"
  }
}
```

- `sentiments` 恒返回 5 档（缺的档 `count: 0, ratio: 0`），`sentimentStatus` 才表达整体有无数据。
- 无 `canViewCommercial` 时：`ratingAvg` / `reviewCount` 为 `no_access`，`sentiments[].count` 与 `ratio` 为 `null`（档位名称仍返回），`trend` 整体 `status: "no_access"` 且两个数组为空。主题 `tags`、工单 `topics` 不属商业敏感，不受影响。
- 竞品口径：`is_own_brand = 0`；自有品牌行不得混入。竞品星级/评论数同样受 `canViewCommercial` 限制。
- 样例中 `voc_competitor.spu_code` 仅在 `voc_model` 能匹配到 SPU 时才有值，匹配不到时 `status: "empty"` 且 `rows: []`，**不伪造兜底数据**。

### 4.7 聚合上下文

```
GET /api/products/:spu/context?days=30
→ { "overview": <4.4>, "channels": <4.5>, "external": <4.6> }
```

`context` 只调用三个 Service，不直接查表；**不再返回 `keywords`**。

## 5. 数据状态判定

| 状态 | 判定 |
|---|---|
| `ready` | 有行且值非空 |
| `empty` | 有行但聚合结果为 0 / 空集合（`in_stock_qty=0` 属此类仍算 ready，因为 0 是有效值；`sale_qty` 全为 0 记 `ready`） |
| `not_connected` | 源表无该字段 |
| `delayed` | `sync_batch.finished_at` 距今超过 48h（或 `source_ds` 落后最新 ds） |
| `no_access` | 用户 `canViewCommercial=false` 且字段属商业敏感（价格/销量/销售额/库存/评分）——`value` 必须 `null` |
## 6. 与规划的显式偏离

| 项 | 处理 | 理由 |
|---|---|---|
| 新增 `voc_nps_sentiment` | 规划原列表无此表 | NPS 五档占比是页面必需口径，单独成表比塞进 `jsonb` 更易查询 |
| 新增 `voc_ticket_topic` | 规划原列表无此表 | 样例中 `dwb_cs_voc_record_channel_hf` 是工单而非评论，主题分类需独立落表 |
| `voc_review_day` 只取 `is_own_brand=1` | 规划写「自有评论」 | 样例中该表 94.8% 为竞品，必须按 `is_own_brand` 分流 |
| 不实现竞品价格 / BSR / 搜索关键词 | 规划与 PRD 均不要求 | 源表无字段 |
| 不实现价格趋势 | 规划要求用销量趋势 | 源表无挂牌价日快照 |
| 退货表不接入 | 规划明确第一期不同步 | — |
| 底表不加外键 | — | 样例各表独立抽样，悬挂键会阻塞加载 |
| 列表 `sales30dUsd` 改为 `DataField` | 契约早期写的是裸数字 | 列表同样受商业敏感控制，必须是五态字段 |
| 变体不展示「只有 spu_code 的渠道编码」 | — | 挂到任意变体都是伪造归属，改由渠道页展示 |
| `coverage` 遍历 `COVERAGE_DIMENSIONS` 派生 | — | 避免列表页与契约各自维护一份维度定义 |

## 7. 验收

```bash
pnpm --filter @product360/shared build
pnpm --filter @product360/api exec prisma db push --force-reset
pnpm db:sync          # 加载 8 张 CSV，打印每表行数与 sync_batch
pnpm --filter @product360/api build
pnpm --filter @product360/web exec tsc --noEmit
pnpm dev
```

冒烟（`curl`）：
1. `POST /api/auth/login` 4 个账号各取 token。
2. `GET /api/products?sort=coverage` 首条 `coverage=4`。
3. 用一个 `coverage=4` 的 SPU 跑 `overview` / `channels` / `external` / `context`，四者均 200。
4. 用越权账号访问受限 SPU → 403；受限 SPU 不在列表中。
5. `employee`（`canViewCommercial=false`）访问 `channels` → 价格/销量/销售额/库存均 `no_access` 且 `value===null`。

前端冒烟（`pnpm dev` 后浏览器打开 `http://localhost:5173`）：
1. 四个种子账号分别登录，`/products` 列表条数与 `scope` 文案与后端一致（admin 1067 / operator 754 / data_admin 282）。
2. 列表首条按覆盖度排序为 `coverage=4`，筛选品牌 + 类目 + 状态后 `total` 与 `summary.withDetail` 同步变化。
3. 商品详情三个页签均渲染：概览（基础信息/标签/包装/变体）、全渠道（5 张卡片 + 渠道明细 + 趋势图）、外部信息（星级 + 五档分布 + 口碑走势 + 工单主题 + 竞品）。
4. `employee` 登录后，价格/销量/销售额/库存/星级显示「无权限」，不显示任何数字。
5. 越权 SPU 直达链接显示「无法查看这个商品」错误块，不白屏。

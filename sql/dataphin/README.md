# Dataphin / StarRocks 清洗任务（生产链路）

**这套 SQL 干什么**：从 StarRocks 数仓源表出发，在 Dataphin 里算出商品中心 360 需要的 10 张业务表（+ 1 张同步批次表），输出成 StarRocks 中间表 `p360_*`，再由 Dataphin 集成任务整表同步到生产 PostgreSQL 的 `public.*`。

```
StarRocks 源表（ods/dwd/dws）
        │  ← 本目录 10/11/20-34 的 INSERT ... SELECT（StarRocks SQL 方言）
        ▼
p360_*  （StarRocks 中间表，字段名与 PG 完全同名）
        │  ← Dataphin 集成任务（全量覆盖写 / 同名映射）
        ▼
PG public.*（NestJS API 直接读，页面出数）
```

---

## 0. 与 `sql/sync/` 的区别（别混用）

| | `sql/sync/`（旧） | `sql/dataphin/`（本目录，生产用） |
|---|---|---|
| 方言 | PostgreSQL | **StarRocks** |
| 数据来源 | 本地 CSV → staging 表 | **数仓源表直读** |
| 跑在哪 | 本地 `psql`（`pnpm db:sync:verify`） | **Dataphin 计算任务** |
| 作用 | 证明清洗口径与 TS loader 逐值等价（离线回归基线） | 生产同步链路 |
| 一致性 | 已用 10 张表逐列 md5 证明与 `apps/api/src/sync/loader.ts` 一致 | 由 `sql/sync/` 的口径逐条翻译而来，翻译后未在真实 SR 实例上回归（见第 8 节） |

> 口径的唯一真相仍是 `apps/api/src/sync/loader.ts` + `source.ts`。三处（TS loader / `sql/sync/` / `sql/dataphin/`）任何一处改口径，另外两处必须同步改。见第 9 节。

---

## 1. 文件清单与执行顺序

| 顺序 | 文件 | 产出 | 依赖 |
|---|---|---|---|
| 0（一次性） | `00_pg_patch.sql` | **在 PG 上执行**：11 张表 `id` 列加 `DEFAULT gen_random_uuid()` | 无 |
| 0（一次性） | `01_sr_tables.sql` | 在 SR 上建 11 张 `p360_*` 中间表 | 无 |
| 1 | `10_pd_sku.sql` | `p360_pd_sku` | 源表 `dim_pd_sku_info_df` |
| 2 | `20_sal_sku_code.sql` | `p360_sal_sku_code` | 源表 `dim_sal_sku_info_df` |
| 3 | `21_sal_sku_day.sql` | `p360_sal_sku_day` | 源表 `dws_sal_sku_statistics_td_df` |
| 4 | `22_scm_stock.sql` | `p360_scm_stock` | 源表 `dwb_scm_stock_channel_df` |
| 5 | `30_voc_review_day.sql` | `p360_voc_review_day` | 源表 `dws_cs_voc_nps_review_df` |
| 6 | `31_voc_nps_sentiment.sql` | `p360_voc_nps_sentiment` | 同上 |
| 7 | `32_voc_nps_tag.sql` | `p360_voc_nps_tag` | 同上（JSON 数组展开） |
| 8 | `33_voc_ticket_topic.sql` | `p360_voc_ticket_topic` | 源表 `dwb_cs_voc_record_channel_hf` |
| 9 | `34_voc_competitor.sql` | `p360_voc_competitor` | 源表 `dws_cs_voc_nps_review_df`（竞品口径） |
| **10** | `11_pd_spu.sql` | `p360_pd_spu`（含 coverage 等预聚合列） | **依赖 1、2、3、4、5 的产出表** |
| **11** | `99_sync_batch.sql` | `p360_sync_batch` | **依赖 1–10 全部产出表**（统计行数） |

**两个顺序不能动**：

- `11_pd_spu` 必须最后算：它的 `coverage` / `sku_count` / `channel_count` / `sales_30d_*` / `in_stock_qty` / `review_count` 全部来自前面 5 张 `p360_*` 表。
- `99_sync_batch` 必须最后算：它写的是「每张表这次同步了多少行 + 什么时候同步完」，是页面 `asOf` 和「数据延迟」判定的唯一来源。**漏跑这张表，页面所有字段会显示「延迟/未知」，即使数据是新的。**

---

## 2. `${bizdate}` 与分区

所有任务 SQL 都用同一个分区谓词，Dataphin 任务里把 `${bizdate}` 配成调度参数即可：

```sql
WHERE s.ds = '${bizdate}'          -- ds 是 string / date 类型 'YYYY-MM-DD'
WHERE s.ds = ${bizdate}           -- ds 是 int 类型 yyyyMMdd（去掉引号）
```

写进目标表的 `ds` 列不是调度参数，而是**行内从源表取的**：`cast(s.ds as date) AS ds`。因为分区条件已经把范围锁死到单日，行内取值与 `max(ds)` 等价，且不依赖子查询（SR 部分版本对 SELECT 里的标量标量子查询支持不稳）。

> 如果哪天改成「跑一段区间」而不是单分区，必须回头看三处：`cast(s.ds as date)`（要改成按天分组）、`11_pd_spu` 的 30 天窗口（现在用 `order_date >= max(order_date) - 29`）、`99_sync_batch` 的 `source_ds`。

---

## 3. 集成任务怎么配（同步到 PG）

1. **表名映射**：`p360_pd_spu` → `public.pd_spu`，其余同理（去掉 `p360_` 前缀）。
2. **字段映射**：**按列名映射，不要按顺序**。原因：PG 表的第一列是 `id uuid`，SR 中间表里没有这一列；PG 侧由 `00_pg_patch.sql` 加的 `DEFAULT gen_random_uuid()` 自动填充。SR 中间表的列顺序是「业务主键在前」（DUPLICATE KEY 的要求），与 PG 的列顺序不同。
3. **写入方式**：**全量覆盖**（Dataphin 集成任务的「先清空再写入」/ `TRUNCATE + INSERT`）。`p360_*` 用的是 **DUPLICATE KEY** 模型（不是 PRIMARY KEY），去重不靠引擎，靠每次任务前清表；如果只能 append，就在每个任务 SQL 开头加 `TRUNCATE TABLE p360_xxx;`（Dataphin 里通常配成前置语句更稳）。
4. **任务依赖**：按第 1 节的顺序配依赖。`11_pd_spu` 和 `99_sync_batch` 是汇聚节点，必须等前面全部成功。

---

## 4. `00_pg_patch.sql` 为什么必须跑

Prisma 里 `id` 是 `@id @default(uuid())`，这是**客户端**默认值，数据库层没有 `DEFAULT`。集成任务只写业务列不写 `id`，PG 就会报 `null value in column "id" violates not-null constraint` 整批失败。

```bash
psql "$DATABASE_URL" -f sql/dataphin/00_pg_patch.sql   # 幂等，可重复执行
```

---

## 5. 清洗口径（与 TS loader 一一对应）

清洗语义全部照着 `apps/api/src/sync/loader.ts` 转写，没有一处凭印象编列名或规则。四条全局约定：

### 5.1 文本归一 `T(x)`

```sql
case when lower(cast(x as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$'
     then null
     else regexp_replace(cast(x as string), '^[[:space:]]+|[[:space:]]+$', '') end
```

覆盖：`''`、纯空格、换行、`None`、`NULL`、`NaN`、`n/a`、`-`（大小写不敏感）。

> ⚠ **用 `regexp_replace` 裁 `[[:space:]]`，不要用 `trim()`**。`trim()` 只去空格，不去 `\n`/`\r`；源数据里 `selling_point`、`spu_desc` 这类长文本带换行，用 `trim()` 会产生「看起来是空但没被归一成 NULL」的脏值。（PG 版本踩过这个坑，用 `btrim` 同理失败。）

### 5.2 数字 `N(x)` / 整数 `I(x)`

```sql
-- 金额/尺寸
cast(nullif(regexp_replace(cast(x as string), ',', ''), '') as decimal(18, 4))
-- 数量/枚举码
cast(round(cast(nullif(regexp_replace(cast(x as string), ',', ''), '') as double)) as bigint)
```

**非法值 → NULL，不补 0**（硬规则：源表没有就显示「未接入」）。只有数量类列（库存、订单数、销量）在聚合时按 0 处理，因为它们缺失的业务含义就是「没有」。

金额列 `sales_amount` / `sales_amount_usd` / `sales_30d_usd` 在聚合里用 `sum()` 直接累加：全为 NULL 时结果保持 NULL，页面显示「未接入」——**不会变成 0**。

### 5.3 日期 `D(x)` / 时间戳 `TS(x)`

```sql
cast(nullif(left(cast(x as string), 10), '') as date)      -- 日期
cast(nullif(left(cast(x as string), 19), '') as datetime)  -- 时间戳，截到秒
```

PG 目标列是 `timestamp without time zone`，SR `datetime` 映射过去无时区偏移。**不要**在 SR 侧做 `utc_timestamp()` 之类的转换，两边会差 8 小时。

### 5.4 JSON `J(x)`

```sql
parse_json(cast(x as string))
```

非法 JSON 交给 `parse_json` 返回 NULL（等价 loader 的 `try/catch → null`）。注意 SR 的 `parse_json` 对**空串**的处理不同于 NULL，所以 `attr_info` / `sensitive_info` / `tag_info` 这类列在源数据里如果是空串，建议先走一遍 `T(x)` 再 parse。当前样例数据里这几列要么是合法 JSON 要么是 NULL，未做额外包裹。

### 5.5 去重规则

PG 版用 `DISTINCT ON (key) ORDER BY key, _row_no DESC` 复现 loader 的「Map 后写覆盖前写」。SR 没有 CSV 行序，改成**确定性排序**：

| 目标表 | 去重键 | 排序（取第 1 条） |
|---|---|---|
| `pd_sku` | `sku_code` | `update_time DESC` |
| `pd_spu` | `spu_code` | `update_time DESC` |
| `sal_sku_code` | `channel, site, shop_code, sale_sku_code, sku_code` | **`sal_listing_time DESC`**（源表无 `update_time`） |
| 其余 | 直接 GROUP BY 聚合，无需去重 | — |

### 5.6 特殊字段

| 字段 | 口径 |
|---|---|
| `spu_model_name` | `model_info[0].model_name` → 回退 `model_info[0].modelName` → 回退 `pd_sku` 里同 SPU 的 `spu_model_name` |
| `market_countries` | PG `text[]`，SR 侧输出**数组字面量字符串**：`concat('{', array_join(array_sort(collect_set(country_code)), ','), '}')`；无数据为 `{}`（不是 NULL，也不是 `NULL` 字符串） |
| `coverage`（0–4） | ①有 SKU ②有渠道编码 ③有销量 ④有口碑，各计 1；列表页默认按它倒序 |
| `has_sales` | 该 SPU 在 `sal_sku_day` 里出现过即为 `true` |
| `sales_30d_qty/usd` | 窗口 = **销售表最大 `order_date` 往前 29 天**（不是 `now()`，否则样例数据永远算不出数） |
| `rating_avg` | 按评论数加权：`sum(rating * review_count) / sum(review_count)` |
| `return_qty`（PG 列名 `after_sale_replacement_qty`） | 源表只有「售后换货数量」，没有独立退货列，页面文案按「退货/换货」处理 |
| 自有/竞品口径 | 自有 `is_own_brand = '1'`；竞品 **`is_own_brand <> '1'`**（空值/NULL 算竞品，不能写成 `= '0'`） |
| `voc_competitor.spu_code` | 恒为 `NULL`（竞品没有内部 SPU 编码），保留列只为对齐结构 |
| 渠道编码缺 UPC/GTIN/EAN | 源表没有这些字段，页面显示「未接入」，**不造值** |

---

## 6. 等价性验证结果

验证方法：`sql/sync/` 的 PG 版清洗跑出来的 10 张表，与 `apps/api/src/sync/loader.ts` 直接加载样例 CSV 的结果，**逐表逐列导出 CSV 做 md5 比对（排除自增 `id`）**，命令 `pnpm db:sync:verify`。

10 张表全部一致后，才把 PG 方言逐条翻译成 SR 方言。翻译带来的**唯一已知差异**：

| 表 | 差异 | 原因 | 是否需要处理 |
|---|---|---|---|
| `sal_sku_code` | **差 1 行** | 该源表没有 `update_time`。PG 版按 CSV 行序取「文件最后一行」，SR 版按 `sal_listing_time DESC` 取「最后上架的那条」。是同一个平台 SKU 的两条重复记录。 | 不需要。SR 版语义更合理（无行序时按业务时间取最新）；已在代码注释与本节记录。 |

其余 9 张表（`pd_spu` / `pd_sku` / `sal_sku_day` / `scm_stock` / `voc_review_day` / `voc_nps_sentiment` / `voc_nps_tag` / `voc_ticket_topic` / `voc_competitor`）在把去重排序换成 `update_time DESC` 后**逐字节一致**。

样例数据基线（用于上线后对账）：

```
pd_spu 1067 / pd_sku 1979 / sal_sku_code 1999 / sal_sku_day 1999 / scm_stock 1461
voc_review_day 896 / voc_nps_sentiment 177 / voc_nps_tag 1654 / voc_ticket_topic 713 / voc_competitor 102
coverage 分布：4→571 / 3→253 / 2→132 / 1→76 / 0→35
```

---

## 7. 类型映射（SR → PG）

| SR | PG | 注意 |
|---|---|---|
| `varchar(n)` | `text` / `varchar(n)` | 长度按 PG 实际列宽给（见 `01_sr_tables.sql`），超长会在集成阶段被截断或报错 |
| `string` | `text` | 长文本（描述、图片 URL、HTML） |
| `int` | `integer` | |
| `bigint` | `integer` / `bigint` | 数量列都走 `bigint` 再落 `integer`，不会溢出 |
| `decimal(18,4)` | `numeric(14,4)` / `numeric(16,4)` | 精度按 PG 列定义，超范围会在写入时报错；当前源数据最大 4 位小数，安全 |
| `decimal(4,3)` | `numeric(4,3)` | 星级 |
| `decimal(6,4)` | `numeric(6,4)` | 占比 |
| `datetime` | `timestamp` | 见 5.3，不要做时区转换 |
| `date` | `date` | |
| `json` | `jsonb` | |
| `boolean` | `boolean` | 只有 `has_sales` 一列 |
| `varchar` 存 `{US,DE}` | `text[]` | 见 5.6 |

---

## 8. 上线前必须验证的风险点（**这套 SR SQL 未在真实 SR 实例上执行过**）

本地没有 StarRocks，所有 SR 方言 SQL 只做了静态检查（括号/引号配平、列名与 DDL 一致、SELECT 列顺序与 DDL 一致、无 PG 方言残留）。**第一次在 Dataphin 上跑，请按下面顺序单表试跑并核对行数**：

1. **`RLIKE` 正则**：`'^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$'` 依赖 POSIX 字符类 `[[:space:]]`。SR 的 `RLIKE` 基于 RE2，POSIX 类支持，但如果报错，换成 `'^[ \\t\\r\\n]*(none|null|nan|n/a|-)?[ \\t\\r\\n]*$'`。
2. **`parse_json` 对非法 JSON 的行为**：可能返回 NULL，也可能抛错导致整任务失败。先用
   `SELECT count(*) FROM 源表 WHERE ds='${bizdate}' AND parse_json(cast(col as string)) IS NULL AND col IS NOT NULL;`
   确认没有「非法 JSON + 非空」的行；如果有，先在上游修数据或改成 `try_parse_json`（若版本支持）。
3. **`json_length` + `get_json_string` 动态路径**（`32_voc_nps_tag.sql` 的数组展开）：验证
   `SELECT json_length(parse_json('[{"a":1}]'))` 和 `get_json_string(parse_json('[{"tag_name":"x"}]'), '$[0]')` 是否都返回预期值。若 `get_json_string` 对对象返回 NULL，改用 `json_query` 或 `get_json_object`。
4. **`array_sort` / `collect_set` / `array_join`**（`11_pd_spu.sql` 的 `market_countries`）：验 `SELECT array_join(array_sort(collect_set(country_code)), ',') FROM p360_sal_sku_day;`。若 `array_sort` 不存在，去掉排序（`collect_set` 本身无序，但数组字面量无序不影响前端 `.length` / `.join()` 用法）。
5. **`INSERT INTO ... SELECT ... CROSS JOIN (数字辅助表)`**：SR 对 `INSERT` 内的复杂查询一般没问题，但如果报「不支持 CROSS JOIN」，把数字表改成物理小表（如 `SELECT number FROM numbers_0_99`）。
6. **`DUPLICATE KEY` 建表**：`01_sr_tables.sql` 的 key 列必须是表的前几列且顺序一致。如果你们的表模型规范要求 `PRIMARY KEY`，需要先把 `site` / `shop_code` / `warehouse_code` 这些可空列从 key 里挪出去（或给它们填默认值，但这违背「不造数据」规则，不推荐）。

对账 SQL（每张表跑一遍，与第 6 节基线比）：

```sql
SELECT 'pd_spu' AS t, count(*) FROM p360_pd_spu
UNION ALL SELECT 'pd_sku', count(*) FROM p360_pd_sku
UNION ALL SELECT 'sal_sku_code', count(*) FROM p360_sal_sku_code
UNION ALL SELECT 'sal_sku_day', count(*) FROM p360_sal_sku_day
UNION ALL SELECT 'scm_stock', count(*) FROM p360_scm_stock
UNION ALL SELECT 'voc_review_day', count(*) FROM p360_voc_review_day
UNION ALL SELECT 'voc_nps_sentiment', count(*) FROM p360_voc_nps_sentiment
UNION ALL SELECT 'voc_nps_tag', count(*) FROM p360_voc_nps_tag
UNION ALL SELECT 'voc_ticket_topic', count(*) FROM p360_voc_ticket_topic
UNION ALL SELECT 'voc_competitor', count(*) FROM p360_voc_competitor;
```

---

## 9. 口径变更的同步修改清单

只有一处真相（`apps/api/src/sync/loader.ts`），但落地在三处。改口径时**三处一起改**，否则页面数据会和验证基线漂移：

| 改了什么 | 要同步改 |
|---|---|
| TS loader | `apps/api/src/sync/loader.ts` |
| 生产链路（SR） | 本目录对应的 `1x/2x/3x_*.sql` |
| 离线回归基线（PG） | `sql/sync/*.sql` + `scripts/verify-sync-sql.sh` |

改完必须跑 `pnpm db:sync:verify` 证明 PG 版仍与 loader 一致，再在 Dataphin 上单表试跑确认 SR 版行数与基线一致。

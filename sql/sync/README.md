# StarRocks → PostgreSQL 清洗 SQL

把 8 张 StarRocks 源表清洗成 9 张页面底表的 SQL 版实现。
与 `apps/api/src/sync/loader.ts`（CSV 加载器）**口径完全一致**，已逐表逐列验证：

```
pd_spu              1067 行  ✅   sal_sku_day         1999 行  ✅
pd_sku              1979 行  ✅   scm_stock           1461 行  ✅
sal_sku_code        1999 行  ✅   voc_review_day       896 行  ✅
voc_nps_sentiment    177 行  ✅   voc_nps_tag         1654 行  ✅
voc_ticket_topic     713 行  ✅   voc_competitor       102 行  ✅
```

复验命令（会重建临时库、全量跑一遍、与 `pnpm db:sync` 的结果逐值对比）：

```bash
docker compose up -d postgres        # 需要本地 PG
pnpm db:sync                         # 参考库（TS loader 口径）
pnpm db:sync:verify                  # SQL 口径 vs loader 口径
```

## 1. 为什么清洗放在 PG 侧

StarRocks 只负责**导出列**，PG 负责**清洗 + 聚合**：

| 对比 | PG 侧清洗（本目录默认） | StarRocks 侧清洗 |
|---|---|---|
| 函数复用 | `sr_text/sr_int/...` 只维护一份 | 每个表都要展开成 CASE 表达式 |
| JSON 展开 | `jsonb_array_elements` 一行搞定 | 依赖版本，语法差异大 |
| 口径变更 | 改一个 SQL 文件 | 改 N 个导出任务 |
| 可验证性 | 本地 PG 可跑通并逐值比对 | 需要连生产 StarRocks |
| 预聚合回填 | 本来就是跨表 UPDATE，必须在 PG 做 | 做不到（跨源） |

数据量级（样例：源表 2000 行 / 目标 1067 行）下 PG 完全够用。

## 2. 执行顺序

| 文件 | 作用 | 目标表 |
|---|---|---|
| `00_functions.sql` | 清洗函数（与 `source.ts` 语义逐条对齐） | — |
| `01_stage_ddl.sql` | staging 表（全列 text + 载入序号），由 `gen_stage.py` 生成 | 7 张 `stage_*` |
| `02_stage_load.sql` | StarRocks 导出的 CSV `\copy` 进 staging | 7 张 `stage_*` |
| `10_pd_sku.sql` | SKU 主档 | `pd_sku` |
| `11_pd_spu.sql` | SPU 主档 | `pd_spu` |
| `20_sal_sku_code.sql` | 外部编码（ASIN / 平台 SKU） | `sal_sku_code` |
| `21_sal_sku_day.sql` | 销售日汇总 | `sal_sku_day` |
| `22_scm_stock.sql` | 渠道库存 | `scm_stock` |
| `30_voc_review_day.sql` | 自有评论日汇总 | `voc_review_day` |
| `31_voc_nps_sentiment.sql` | NPS 五档分布 | `voc_nps_sentiment` |
| `32_voc_nps_tag.sql` | 体验因子（JSON 数组展开） | `voc_nps_tag` |
| `33_voc_ticket_topic.sql` | 工单主题 | `voc_ticket_topic` |
| `34_voc_competitor.sql` | 竞品口碑 | `voc_competitor` |
| `90_aggregates.sql` | `pd_spu` 预聚合列回填 + coverage（0–4） | `pd_spu` |
| `95_sync_batch.sql` | 写同步批次（页面 `asOf` / `delayed` 的唯一来源） | `sync_batch` |
| `99_verify.sql` | 同步后校验 | — |
| `starrocks_export.sql` | StarRocks 侧导出语句（只裁列，不清洗），由 `gen_stage.py` 生成 | — |

**顺序不能改**：`90_aggregates.sql` 依赖前面 8 张表都已就绪，`coverage` 又依赖 `90` 里的前 8 步。
**`95_sync_batch.sql` 不能漏**：不写 `sync_batch`，页面所有数据源都会显示「数据延迟 / 未知日期」。

## 3. 字段映射

| StarRocks 源表 | 目标表 | 粒度 / 去重键 | 关键清洗规则 |
|---|---|---|---|
| `dim_pd_spu_info_df` | `pd_spu` | `spu_code`（同键取最后一行） | `spu_state` 空→1；`spu_state_desc` 空→'待上架'；`spu_model_name` 取 `model_info[0].model_name`，为空时由 `pd_sku` 兜底 |
| `dim_pd_sku_info_df` | `pd_sku` | `sku_code`（同键取最后一行） | `sku_name` 空→回落到 `sku_code`；`deleted` 空→0 |
| `dim_sal_sku_info_df` | `sal_sku_code` | `channel\|site\|shop_code\|sale_sku_code\|sku_code` | `sale_sku_code`/`channel` 任一空→丢弃；价格取 `sku_suggest_price`，上架人取 `sal_operator_name` |
| `dws_sal_sku_statistics_td_df` | `sal_sku_day` | `order_date\|platform\|shop\|country_code\|platform_sku` | 数量、金额按粒度**相加**；金额全空保持 NULL；`after_sale_replacement_qty` → `return_qty` |
| `dwb_scm_stock_channel_df` | `scm_stock` | `channel_code\|country_code\|sku_code\|warehouse_code` | 数量相加，缺失按 0 |
| `dws_cs_voc_nps_review_df`（`is_own_brand=1`） | `voc_review_day` | `spu_code\|review_date` | `rating_avg=avg(rating)` 保留 3 位；`review_count=count(*)` |
| 同上 | `voc_nps_sentiment` | `spu_code\|nps_overall_sentiment` | `bucket` 取 `sentiment_bucket` 缺失按 0；`ratio` 按 SPU 内占比 4 位 |
| 同上 | `voc_nps_tag` | `spu_code\|tag_name\|sentiment` | `nps_tag_list` JSON 数组展开成行；`tag_name` 空跳过 |
| 同上（`is_own_brand<>1`） | `voc_competitor` | `brand_name\|voc_model` | `voc_model` 空→'未匹配'；`spu_code` 恒为 NULL |
| `dwb_cs_voc_record_channel_hf` | `voc_ticket_topic` | `spu_code\|topic` | topic 取 `classification_cn → effective_classification_tag → '未分类'`；`voc_type` 取众数；**该表 rating 全为 0，不参与星级** |

## 4. 全局清洗约定（6 条，别漏）

`00_functions.sql` 里的函数就是为了统一这 6 条，改动前先看这里：

1. **空值等价物**：`''`、`none`、`null`、`nan`、`n/a`、`-`（大小写不敏感）全部视为 NULL
   → 对应 `sr_text()`。注意 PG 的 `btrim()` 只裁半角空格，JS 的 `trim()` 连 `\n \r \t` 和全角空格一起裁，
   所以 `sr_text()` 用 `[[:space:]\u00a0\u3000]`，否则 `selling_point` 会多出尾部换行（这个坑实际踩过）。
2. **数字去千分位**：`"1,234.50"` → `1234.50` → `sr_num()`
3. **非法数字 → NULL，绝不补 0**
   → 页面据此显示「未接入」而不是 `$0.00`。唯一例外是数量列（`in_stock_qty`/`order_qty`/`sale_qty`），
   语义上缺失即无库存/无销量，按 0 计。
4. **日期**：只认前 10 位 `YYYY-MM-DD` → `sr_day()`；无时区的时间按 **UTC** 解释 → `sr_ts()`
5. **JSON**：解析失败 → NULL（不是空对象）→ `sr_json()`
6. **去重 = 同键取最后一行**（loader 用 `Map.set` 覆盖）。staging 表带 `_row_no` 自增列，
   SQL 用 `DISTINCT ON (key) ... ORDER BY key, _row_no DESC` 精确复现，不能改成 `ORDER BY update_time`。

## 5. 两条执行路径

### A. 导出 CSV → staging → 本文档 SQL（推荐，已端到端验证）

```bash
# 1) StarRocks 侧：按 starrocks_export.sql 导出 CSV（UTF-8），落到 /data/stage/
#    文件名与 staging 表对应：pd_spu.csv / pd_sku.csv / sal_sku_code.csv /
#    sal_sku_day.csv / scm_stock.csv / voc_nps.csv / voc_ticket.csv

# 2) PG 侧：建 staging → 灌数 → 清洗 → 校验
psql -f sql/sync/00_functions.sql
psql -f sql/sync/01_stage_ddl.sql
psql -f sql/sync/02_stage_load.sql
for f in 10 11 20 21 22 30 31 32 33 34 90 95; do psql -f sql/sync/${f}_*.sql; done
psql -f sql/sync/99_verify.sql
```

### B. StarRocks JDBC Catalog 直写 PG（未采用，差异说明）

StarRocks 3.x 建好 PG catalog 后可以 `INSERT INTO pg.public.pd_sku SELECT ...`，但：

- `sr_text/sr_int/sr_num/sr_day/sr_ts/sr_json` 六个函数在 StarRocks 里不存在，必须逐处内联成 CASE，
  等价写法见 `00_functions.sql` 内注释（`TRIM` 同样只裁半角空格，要用 `regexp_replace`）
- `32_voc_nps_tag.sql` 的 JSON 数组展开、`33` 的众数、`31` 的窗口占比函数都依赖方言，需要重写
- **`90_aggregates.sql` 无法跨源执行**（它是 PG 内部的 UPDATE ... FROM 多表关联），
  所以无论走哪条路径，预聚合与 `coverage` 都必须在 PG 跑

因此本目录只维护 PG 侧 SQL，StarRocks 侧保持「只导出、不清洗」。

## 6. 全量覆盖与增量改造

当前所有脚本都是 **TRUNCATE + 全量 INSERT**，对应 StarRocks 每日全量快照的用法。
如果需要增量：

- 把 `TRUNCATE` 换成按 `ds` 分区删除：`DELETE FROM sal_sku_day WHERE ds = '${ds}'`
- 把 `INSERT` 换成 `INSERT ... ON CONFLICT (唯一键) DO UPDATE`（`voc_*` 三张表有唯一约束，其他表没有）
- `90_aggregates.sql` 是全表重算，增量场景需要改成「只重算受影响 SPU」——注意 `sales_30d_usd`
  依赖 `(SELECT max(order_date) FROM sal_sku_day)`，增量下要传入目标 ds

## 7. 与 TS loader 的关系

两条路径共用**同一套口径**，但代码是两份：

- `apps/api/src/sync/loader.ts` —— 本地开发 / 样例数据（`pnpm db:sync`）
- `sql/sync/*.sql` —— 生产 StarRocks 同步

**改口径必须同时改两边**，改完跑 `pnpm db:sync:verify` 证明两者仍然一致。
如果生产切到 SQL 路径并且不再用样例 CSV，可以删掉 loader，或者反过来把 SQL 作为唯一真源、
写一个小的 Node 脚本按 `01/02` 的方式调用 psql。
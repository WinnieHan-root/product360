-- =============================================================================
-- 22_scm_stock.sql —— dwb_scm_stock_channel_df → p360_scm_stock（渠道库存）
-- =============================================================================
-- 清洗规则（对齐 loader.ts: loadStock）：
--   1. channel_code / sku_code 任一为空 → 丢弃
--   2. 粒度 = channel_code | country_code | sku_code | warehouse_code，数量相加
--   3. in_stock_qty / on_way_qty 缺失按 0（数量列缺失即无库存，不显示「未接入」）
--   4. warehouse_name 取该粒度任一行（min 保证可重跑）
--   5. 行级库存分析必须按 (channel, sku) 真实匹配，不允许跨渠道借数量
-- =============================================================================

INSERT INTO p360_scm_stock
SELECT
  s.channel_code,
  s.country_code,
  s.sku_code,
  s.warehouse_code,
  min(s.ds)                        AS ds,
  min(s.warehouse_name)            AS warehouse_name,
  sum(coalesce(s.in_stock_qty, 0)) AS in_stock_qty,
  sum(coalesce(s.on_way_qty, 0))   AS on_way_qty
FROM (
  SELECT
    cast(t.ds as date) AS ds,
    case when lower(cast(t.channel_code as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$' then null else regexp_replace(cast(t.channel_code as string), '^[[:space:]]+|[[:space:]]+$', '') end AS channel_code,
    case when lower(cast(t.country_code as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$' then null else regexp_replace(cast(t.country_code as string), '^[[:space:]]+|[[:space:]]+$', '') end AS country_code,
    case when lower(cast(t.sku_code as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$' then null else regexp_replace(cast(t.sku_code as string), '^[[:space:]]+|[[:space:]]+$', '') end AS sku_code,
    case when lower(cast(t.warehouse_code as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$' then null else regexp_replace(cast(t.warehouse_code as string), '^[[:space:]]+|[[:space:]]+$', '') end AS warehouse_code,
    case when lower(cast(t.warehouse_name as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$' then null else regexp_replace(cast(t.warehouse_name as string), '^[[:space:]]+|[[:space:]]+$', '') end AS warehouse_name,
    cast(round(cast(nullif(regexp_replace(cast(t.in_stock_qty as string), ',', ''), '') as double)) as bigint) AS in_stock_qty,
    cast(round(cast(nullif(regexp_replace(cast(t.on_way_qty as string), ',', ''), '') as double)) as bigint) AS on_way_qty
  FROM dwb_scm_stock_channel_df t
  WHERE t.ds = '${bizdate}'
) s
WHERE s.channel_code IS NOT NULL
  AND s.sku_code IS NOT NULL
GROUP BY s.channel_code, s.country_code, s.sku_code, s.warehouse_code;
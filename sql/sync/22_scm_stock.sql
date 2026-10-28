-- =============================================================================
-- 22_scm_stock.sql —— dwb_scm_stock_channel_df → scm_stock（渠道库存）
-- =============================================================================
-- 清洗规则（对应 loader.ts: loadStock）：
--   1. channel_code / sku_code 任一为空 → 丢弃
--   2. 粒度 = channel_code | country_code | sku_code | warehouse_code，同粒度相加
--   3. in_stock_qty / on_way_qty 为空 → 0（这是数量列，缺失视为无库存）
--   4. warehouse_name 取该粒度首行（MIN 保证确定性）
--   5. 行级库存分析必须按 (channel, sku) 真实匹配，不允许跨渠道借数量
-- =============================================================================

TRUNCATE TABLE scm_stock;

WITH src AS (
  SELECT
    sr_text(s.channel_code)                 AS channel_code,
    sr_text(s.country_code)                 AS country_code,
    sr_text(s.sku_code)                     AS sku_code,
    sr_text(s.warehouse_code)               AS warehouse_code,
    sr_text(s.warehouse_name)               AS warehouse_name,
    COALESCE(sr_int(s.in_stock_qty), 0)     AS in_stock_qty,
    COALESCE(sr_int(s.on_way_qty), 0)       AS on_way_qty,
    (SELECT max(sr_day(ds)) FROM stage_scm_stock) AS ds
  FROM stage_scm_stock s
  WHERE sr_text(s.channel_code) IS NOT NULL
    AND sr_text(s.sku_code) IS NOT NULL
)
INSERT INTO scm_stock (
  id, ds, channel_code, country_code, sku_code, warehouse_code, warehouse_name,
  in_stock_qty, on_way_qty
)
SELECT
  gen_random_uuid(),
  min(ds),
  channel_code, country_code, sku_code, warehouse_code, min(warehouse_name),
  sum(in_stock_qty)::int,
  sum(on_way_qty)::int
FROM src
GROUP BY channel_code, country_code, sku_code, warehouse_code;
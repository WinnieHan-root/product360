-- =============================================================================
-- 20_sal_sku_code.sql —— dim_sal_sku_info_df → sal_sku_code（外部编码）
-- =============================================================================
-- 清洗规则（对应 loader.ts: loadSalSkuCode）：
--   1. sale_sku_code / channel 任一为空 → 丢弃（这两个是业务主键的一半）
--   2. 去重键 = channel | site | shop_code | sale_sku_code | sku_code，同键保留最后一行
--   3. 源表没有 UPC / GTIN / EAN / Item ID，只有 asin 与平台 SKU，页面按「未接入」展示
--   4. 价格取 sku_suggest_price，币种取 sku_suggest_currency（源表列名带 sku_ 前缀）
--   5. 上架人取 sal_operator_name
-- =============================================================================

TRUNCATE TABLE sal_sku_code;

WITH src AS (
  SELECT
    s._row_no,
    (SELECT max(sr_day(ds)) FROM stage_sal_sku_code) AS ds,
    sr_text(s.channel)                AS channel,
    sr_text(s.channel_name)           AS channel_name,
    sr_text(s.site)                   AS site,
    sr_text(s.shop_code)              AS shop_code,
    sr_text(s.shop_name)              AS shop_name,
    sr_text(s.sale_sku_code)          AS sale_sku_code,
    sr_text(s.asin)                   AS asin,
    sr_text(s.parent_asin)            AS parent_asin,
    sr_text(s.asin_url)               AS asin_url,
    sr_text(s.sku_code)               AS sku_code,
    sr_text(s.scm_sku_code)           AS scm_sku_code,
    sr_text(s.spu_code)               AS spu_code,
    sr_text(s.listing_status)         AS listing_status,
    sr_ts(s.sal_listing_time)         AS sal_listing_time,
    sr_ts(s.first_order_time)         AS first_order_time,
    sr_text(s.sku_suggest_currency)   AS suggest_currency,
    sr_num(s.sku_suggest_price)       AS suggest_price,
    sr_int(s.sal_sku_qty)             AS sale_sku_qty,
    sr_text(s.sal_image_url)          AS sal_image_url,
    sr_text(s.category_name_level1)   AS category_name_level1,
    sr_text(s.sal_operator_name)      AS listing_operator
  FROM stage_sal_sku_code s
), keyed AS (
  SELECT *,
         concat_ws('|', channel, site, shop_code, sale_sku_code, sku_code) AS natural_key
  FROM src
  WHERE sale_sku_code IS NOT NULL AND channel IS NOT NULL
)
INSERT INTO sal_sku_code (
  id, ds, channel, channel_name, site, shop_code, shop_name, sale_sku_code,
  asin, parent_asin, asin_url, sku_code, scm_sku_code, spu_code, listing_status,
  sal_listing_time, first_order_time, suggest_currency, suggest_price, sale_sku_qty,
  sal_image_url, category_name_level1, listing_operator
)
SELECT DISTINCT ON (natural_key)
  gen_random_uuid(), ds, channel, channel_name, site, shop_code, shop_name, sale_sku_code,
  asin, parent_asin, asin_url, sku_code, scm_sku_code, spu_code, listing_status,
  sal_listing_time, first_order_time, suggest_currency, suggest_price, sale_sku_qty,
  sal_image_url, category_name_level1, listing_operator
FROM keyed
ORDER BY natural_key, _row_no DESC;
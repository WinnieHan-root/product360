-- =============================================================================
-- 23_sal_sku_online_listing.sql —— ads_sal_sku_online_listing_df → sal_sku_online_listing
-- =============================================================================
-- 清洗规则（对应 loader.ts: loadSalSkuOnlineListing）：
--   1. channel / msku / listing_status 任一为空 → 丢弃（业务键 + 状态都不可缺）
--   2. 去重键 = channel | site | shop_code | msku，同键保留最后一行
--      （loader 是 Map 覆盖；本文件用 _row_no DESC 复现同一语义）
--   3. external_id / external_id_type / listing_status_raw / src_table 缺失 → 空串（目标列 NOT NULL）
--      has_* / content_item_cnt 缺失 → 0（源端已算好，不重算）
--   4. 金额 / inventory_qty / rating 空值保持 NULL（页面显示「未接入」，不补 0）
--   5. 源端 pt 列是任务执行时间戳，不落库（asOf 由 ds + sync_batch 提供）
--
-- 本表当前只覆盖 amazon 与 aliexpress 两个渠道（src_table 仅两张源表）。
-- =============================================================================

TRUNCATE TABLE sal_sku_online_listing;

WITH src AS (
  SELECT
    s._row_no,
    (SELECT max(sr_day(ds)) FROM stage_sal_sku_online_listing) AS ds,
    sr_text(s.channel)              AS channel,
    sr_text(s.site)                 AS site,
    sr_text(s.shop_code)            AS shop_code,
    sr_text(s.msku)                 AS msku,
    coalesce(sr_text(s.external_id), '')      AS external_id,
    coalesce(sr_text(s.external_id_type), '') AS external_id_type,
    sr_text(s.parent_external_id)   AS parent_external_id,
    sr_text(s.sku_code)             AS sku_code,
    sr_text(s.scm_sku_code)         AS scm_sku_code,
    sr_text(s.spu_code)             AS spu_code,
    sr_text(s.title)                AS title,
    sr_text(s.description_summary)  AS description_summary,
    sr_text(s.main_image_url)       AS main_image_url,
    sr_text(s.listing_status)       AS listing_status,
    coalesce(sr_text(s.listing_status_raw), '') AS listing_status_raw,
    sr_text(s.operator_name)        AS operator_name,
    sr_text(s.currency_code)        AS currency_code,
    sr_num(s.list_price)            AS list_price,
    sr_num(s.sale_price)            AS sale_price,
    sr_text(s.barcode)              AS barcode,
    sr_int(s.inventory_qty)         AS inventory_qty,
    sr_num(s.rating)                AS rating,
    coalesce(sr_int(s.content_item_cnt), 0) AS content_item_cnt,
    coalesce(sr_int(s.has_title), 0)        AS has_title,
    coalesce(sr_int(s.has_main_image), 0)   AS has_main_image,
    coalesce(sr_int(s.has_description), 0)  AS has_description,
    coalesce(sr_int(s.has_price), 0)        AS has_price,
    coalesce(sr_int(s.has_status), 0)       AS has_status,
    sr_text(s.product_link)         AS product_link,
    coalesce(sr_text(s.src_table), '') AS src_table
  FROM stage_sal_sku_online_listing s
), keyed AS (
  SELECT *,
         concat_ws('|', channel, site, shop_code, msku) AS natural_key
  FROM src
  WHERE channel IS NOT NULL AND msku IS NOT NULL AND listing_status IS NOT NULL
)
INSERT INTO sal_sku_online_listing (
  id, ds, channel, site, shop_code, msku, external_id, external_id_type, parent_external_id,
  sku_code, scm_sku_code, spu_code, title, description_summary, main_image_url,
  listing_status, listing_status_raw, operator_name, currency_code, list_price, sale_price,
  barcode, inventory_qty, rating, content_item_cnt,
  has_title, has_main_image, has_description, has_price, has_status, product_link, src_table
)
SELECT DISTINCT ON (natural_key)
  gen_random_uuid(), ds, channel, site, shop_code, msku, external_id, external_id_type,
  parent_external_id, sku_code, scm_sku_code, spu_code, title, description_summary,
  main_image_url, listing_status, listing_status_raw, operator_name, currency_code,
  list_price, sale_price, barcode, inventory_qty, rating, content_item_cnt,
  has_title, has_main_image, has_description, has_price, has_status, product_link, src_table
FROM keyed
ORDER BY natural_key, _row_no DESC;

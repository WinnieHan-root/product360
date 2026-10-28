-- =============================================================================
-- 10_pd_sku.sql —— dim_pd_sku_info_df → pd_sku
-- =============================================================================
-- 清洗规则（对应 loader.ts: loadSku）：
--   1. sku_code 为空 → 丢弃
--   2. 同一 sku_code 多行 → 保留最后一行（loader 用 Map.set 覆盖，靠 _row_no 复现）
--   3. sku_name 为空 → 回落成 sku_code（NOT NULL 列）
--   4. deleted 为空 → 0
--   5. 数字列非法值 → NULL（不补 0）
--   6. attr_info / sensitive_info 非法 JSON → NULL
-- =============================================================================

TRUNCATE TABLE pd_sku;

WITH src AS (
  SELECT
    s._row_no,
    (SELECT max(sr_day(ds)) FROM stage_pd_sku) AS ds,
    sr_text(s.sku_code)                         AS sku_code,
    sr_text(s.sku_code_new)                     AS sku_code_new,
    sr_text(s.scm_sku_code)                     AS scm_sku_code,
    sr_text(s.sku_name)                         AS sku_name_raw,
    sr_text(s.sku_name_en)                      AS sku_name_en,
    sr_text(s.sku_image_url)                    AS sku_image_url,
    sr_int(s.sku_state)                         AS sku_state,
    sr_text(s.sku_state_desc)                   AS sku_state_desc,
    sr_text(s.brand_code)                       AS brand_code,
    sr_text(s.brand_name)                       AS brand_name,
    sr_text(s.suggest_currency)                 AS suggest_currency,
    sr_num(s.suggest_price)                     AS suggest_price,
    sr_text(s.spu_code)                         AS spu_code,
    sr_text(s.spu_name)                         AS spu_name,
    sr_text(s.spu_model_name)                   AS spu_model_name,
    sr_num(s.spec_product_length)               AS spec_product_length,
    sr_num(s.spec_product_width)                AS spec_product_width,
    sr_num(s.spec_product_height)               AS spec_product_height,
    sr_num(s.spec_product_weight)               AS spec_product_weight,
    sr_num(s.spec_product_net_weight)           AS spec_product_net_weight,
    sr_num(s.spec_carton_length)                AS spec_carton_length,
    sr_num(s.spec_carton_width)                 AS spec_carton_width,
    sr_num(s.spec_carton_height)                AS spec_carton_height,
    sr_num(s.spec_carton_weight)                AS spec_carton_weight,
    sr_int(s.spec_carton_num)                   AS spec_carton_num,
    sr_text(s.spec_material)                    AS spec_material,
    sr_text(s.sku_color)                        AS sku_color,
    sr_text(s.sku_size)                         AS sku_size,
    sr_text(s.sku_pack)                         AS sku_pack,
    sr_ts(s.listing_time)                       AS listing_time,
    sr_json(s.attr_info)                        AS attr_info,
    sr_json(s.sensitive_info)                   AS sensitive_info,
    COALESCE(sr_int(s.deleted), 0)              AS deleted,
    sr_ts(s.update_time)                        AS update_time
  FROM stage_pd_sku s
)
INSERT INTO pd_sku (
  id, ds, sku_code, sku_code_new, scm_sku_code, sku_name, sku_name_en, sku_image_url,
  sku_state, sku_state_desc, brand_code, brand_name, suggest_currency, suggest_price,
  spu_code, spu_name, spu_model_name,
  spec_product_length, spec_product_width, spec_product_height, spec_product_weight,
  spec_product_net_weight, spec_carton_length, spec_carton_width, spec_carton_height,
  spec_carton_weight, spec_carton_num, spec_material,
  sku_color, sku_size, sku_pack, listing_time, attr_info, sensitive_info,
  deleted, update_time
)
SELECT DISTINCT ON (sku_code)
  gen_random_uuid(), ds, sku_code, sku_code_new, scm_sku_code,
  COALESCE(sku_name_raw, sku_code) AS sku_name,
  sku_name_en, sku_image_url,
  sku_state, sku_state_desc, brand_code, brand_name, suggest_currency, suggest_price,
  spu_code, spu_name, spu_model_name,
  spec_product_length, spec_product_width, spec_product_height, spec_product_weight,
  spec_product_net_weight, spec_carton_length, spec_carton_width, spec_carton_height,
  spec_carton_weight, spec_carton_num, spec_material,
  sku_color, sku_size, sku_pack, listing_time, attr_info, sensitive_info,
  deleted, update_time
FROM src
WHERE sku_code IS NOT NULL
ORDER BY sku_code, _row_no DESC;   -- 同键后者覆盖前者
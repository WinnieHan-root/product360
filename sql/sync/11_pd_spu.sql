-- =============================================================================
-- 11_pd_spu.sql —— dim_pd_spu_info_df → pd_spu
-- =============================================================================
-- 清洗规则（对应 loader.ts: loadSpu / modelNameOf）：
--   1. spu_code 为空 → 丢弃；同 spu_code 保留最后一行
--   2. spu_name 为空 → 回落成 spu_code
--   3. spu_state 为空 → 1；spu_state_desc 为空 → '待上架'
--   4. spu_model_name 从 model_info 首元素的 model_name / modelName 取（源表上级字段）
--   5. deleted 为空 → 0；tag_info / series_info / model_info 非法 JSON → NULL
--   6. coverage / sku_count / channel_count / market_countries / sales_30d_* /
--      in_stock_qty / review_count / rating_avg 由 90_aggregates.sql 回填
-- =============================================================================

TRUNCATE TABLE pd_spu;

WITH src AS (
  SELECT
    s._row_no,
    (SELECT max(sr_day(ds)) FROM stage_pd_spu)  AS ds,
    sr_text(s.company_code)                     AS company_code,
    sr_text(s.spu_code)                         AS spu_code,
    sr_text(s.spu_name)                         AS spu_name_raw,
    sr_text(s.spu_name_en)                      AS spu_name_en,
    sr_text(s.spu_alias_name)                   AS spu_alias_name,
    sr_text(s.spu_image)                        AS spu_image,
    sr_text(s.spu_level_new)                    AS spu_level_new,
    COALESCE(sr_int(s.spu_state), 1)            AS spu_state,
    COALESCE(sr_text(s.spu_state_desc), '待上架') AS spu_state_desc,
    sr_json(s.model_info)                       AS model_info,
    sr_text(s.spu_product_type_desc)            AS spu_product_type_desc,
    sr_text(s.spu_desc)                         AS spu_desc,
    sr_text(s.selling_point)                    AS selling_point,
    sr_text(s.product_line_code)                AS product_line_code,
    sr_text(s.product_line_name)                AS product_line_name,
    sr_text(s.gtm_code)                         AS gtm_code,
    sr_text(s.gtm_name)                         AS gtm_name,
    sr_text(s.product_leader_code)              AS product_leader_code,
    sr_text(s.product_leader_name)              AS product_leader_name,
    sr_text(s.planner_name)                     AS planner_name,
    sr_text(s.brand_code)                       AS brand_code,
    sr_text(s.suggest_currency)                 AS suggest_currency,
    sr_num(s.suggest_price)                     AS suggest_price,
    sr_ts(s.listing_time)                       AS listing_time,
    sr_int(s.is_new_spu)                        AS is_new_spu,
    sr_text(s.voc_model)                        AS voc_model,
    sr_text(s.category_code)                    AS category_code,
    sr_text(s.category_name)                    AS category_name,
    sr_text(s.category_code_level1)             AS category_code_level1,
    sr_text(s.category_name_level1)             AS category_name_level1,
    sr_text(s.category_code_level2)             AS category_code_level2,
    sr_text(s.category_name_level2)             AS category_name_level2,
    sr_text(s.category_code_level3)             AS category_code_level3,
    sr_text(s.category_name_level3)             AS category_name_level3,
    sr_text(s.category_code_level4)             AS category_code_level4,
    sr_text(s.category_name_level4)             AS category_name_level4,
    sr_text(s.category_code_level5)             AS category_code_level5,
    sr_text(s.category_name_level5)             AS category_name_level5,
    sr_text(s.category_tag_name)                AS category_tag_name,
    sr_text(s.is_electrical_desc)               AS is_electrical_desc,
    sr_text(s.class_tag_name)                   AS class_tag_name,
    sr_text(s.sence_tag_name)                   AS sence_tag_name,
    sr_text(s.fmcg_tag_name)                    AS fmcg_tag_name,
    sr_text(s.iot_tag_name)                     AS iot_tag_name,
    sr_json(s.tag_info)                         AS tag_info,
    sr_json(s.series_info)                      AS series_info,
    COALESCE(sr_int(s.deleted), 0)              AS deleted,
    sr_ts(s.update_time)                        AS update_time
  FROM stage_pd_spu s
), picked AS (
  SELECT DISTINCT ON (spu_code) * FROM src
  WHERE spu_code IS NOT NULL
  ORDER BY spu_code, _row_no DESC
)
INSERT INTO pd_spu (
  id, ds, company_code, spu_code, spu_name, spu_name_en, spu_alias_name, spu_image,
  spu_level_new, spu_state, spu_state_desc, spu_model_name, spu_product_type_desc,
  spu_desc, selling_point, product_line_code, product_line_name, gtm_code, gtm_name,
  product_leader_code, product_leader_name, planner_name, brand_code,
  suggest_currency, suggest_price, listing_time, is_new_spu, voc_model,
  category_code, category_name,
  category_code_level1, category_name_level1, category_code_level2, category_name_level2,
  category_code_level3, category_name_level3, category_code_level4, category_name_level4,
  category_code_level5, category_name_level5,
  category_tag_name, is_electrical_desc, class_tag_name, sence_tag_name, fmcg_tag_name,
  iot_tag_name, tag_info, series_info, model_info, deleted, update_time
)
SELECT
  gen_random_uuid(), ds, company_code, spu_code,
  COALESCE(spu_name_raw, spu_code) AS spu_name,
  spu_name_en, spu_alias_name, spu_image,
  spu_level_new, spu_state, spu_state_desc,
  -- model_info 是 [{model_name: '...'}] 形式，取首元素的 model_name / modelName
  CASE WHEN jsonb_typeof(model_info) = 'array' THEN
    COALESCE(
      NULLIF(btrim(model_info -> 0 ->> 'model_name'), ''),
      NULLIF(btrim(model_info -> 0 ->> 'modelName'), '')
    )
  END AS spu_model_name,
  spu_product_type_desc, spu_desc, selling_point, product_line_code, product_line_name,
  gtm_code, gtm_name, product_leader_code, product_leader_name, planner_name,
  brand_code, suggest_currency, suggest_price, listing_time, is_new_spu, voc_model,
  category_code, category_name,
  category_code_level1, category_name_level1, category_code_level2, category_name_level2,
  category_code_level3, category_name_level3, category_code_level4, category_name_level4,
  category_code_level5, category_name_level5,
  category_tag_name, is_electrical_desc, class_tag_name, sence_tag_name, fmcg_tag_name,
  iot_tag_name, tag_info, series_info, model_info, deleted, update_time
FROM picked;
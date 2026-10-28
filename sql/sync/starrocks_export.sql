-- =============================================================================
-- starrocks_export.sql —— StarRocks 侧导出语句（只做列裁剪，不做清洗）
-- =============================================================================
-- 由 sql/sync/gen_stage.py 生成，请勿手改。
-- 清洗统一放在 PG 侧（sql/sync/1x~9x），原因：
--   1. 清洗函数 sr_text/sr_int/... 只维护一份，口径变更只改 PG
--   2. StarRocks 侧只需保证列名与类型不变，导出即可
--   3. staging 全部列声明为 text，StarRocks 的 NULL/空串差异不会污染清洗逻辑
--
-- 用法：把 ${ds} 换成目标分区（如 2026-10-26），结果落成 CSV：
--   mysql -h <fe> -P 9030 -u <user> -p --batch --raw -e "$(cat ...)" > pd_spu.csv
--   TRIM 掉 CSV 的 TSV 分隔符后按 sql/sync/02_stage_load.sql 导入
-- =============================================================================

-- dim_pd_spu_info_df（49 列）
SELECT
  ds,
  company_code,
  spu_code,
  spu_name,
  spu_name_en,
  spu_alias_name,
  spu_image,
  spu_level_new,
  spu_state,
  spu_state_desc,
  spu_product_type_desc,
  spu_desc,
  selling_point,
  product_line_code,
  product_line_name,
  gtm_code,
  gtm_name,
  product_leader_code,
  product_leader_name,
  planner_name,
  brand_code,
  suggest_currency,
  suggest_price,
  listing_time,
  is_new_spu,
  voc_model,
  category_code,
  category_name,
  category_code_level1,
  category_name_level1,
  category_code_level2,
  category_name_level2,
  category_code_level3,
  category_name_level3,
  category_code_level4,
  category_name_level4,
  category_code_level5,
  category_name_level5,
  category_tag_name,
  is_electrical_desc,
  class_tag_name,
  sence_tag_name,
  fmcg_tag_name,
  iot_tag_name,
  tag_info,
  series_info,
  model_info,
  deleted,
  update_time
FROM dim_pd_spu_info_df
WHERE ds = '${ds}';

-- dim_pd_sku_info_df（35 列）
SELECT
  ds,
  sku_code,
  sku_code_new,
  scm_sku_code,
  sku_name,
  sku_name_en,
  sku_image_url,
  sku_state,
  sku_state_desc,
  brand_code,
  brand_name,
  suggest_currency,
  suggest_price,
  spu_code,
  spu_name,
  spu_model_name,
  spec_product_length,
  spec_product_width,
  spec_product_height,
  spec_product_weight,
  spec_product_net_weight,
  spec_carton_length,
  spec_carton_width,
  spec_carton_height,
  spec_carton_weight,
  spec_carton_num,
  spec_material,
  sku_color,
  sku_size,
  sku_pack,
  listing_time,
  attr_info,
  sensitive_info,
  deleted,
  update_time
FROM dim_pd_sku_info_df
WHERE ds = '${ds}';

-- dim_sal_sku_info_df（22 列）
SELECT
  ds,
  channel,
  channel_name,
  site,
  shop_code,
  shop_name,
  sale_sku_code,
  asin,
  parent_asin,
  asin_url,
  sku_code,
  scm_sku_code,
  spu_code,
  listing_status,
  sal_listing_time,
  first_order_time,
  sku_suggest_currency,
  sku_suggest_price,
  sal_sku_qty,
  sal_image_url,
  category_name_level1,
  sal_operator_name
FROM dim_sal_sku_info_df
WHERE ds = '${ds}';

-- dws_sal_sku_statistics_td_df（21 列）
SELECT
  ds,
  order_date,
  platform,
  channel,
  shop,
  country_code,
  country_name,
  platform_sku,
  asin,
  parent_asin,
  sku_code,
  spu_code,
  spu_name,
  sku_name,
  sku_brand,
  category_name_level1,
  order_qty,
  sale_qty,
  sales_amount,
  sales_amount_usd,
  after_sale_replacement_qty
FROM dws_sal_sku_statistics_td_df
WHERE ds = '${ds}';

-- dwb_scm_stock_channel_df（8 列）
SELECT
  ds,
  channel_code,
  country_code,
  sku_code,
  warehouse_code,
  warehouse_name,
  in_stock_qty,
  on_way_qty
FROM dwb_scm_stock_channel_df
WHERE ds = '${ds}';

-- dws_cs_voc_nps_review_df（10 列）
SELECT
  ds,
  spu_code,
  review_date,
  rating,
  nps_overall_sentiment,
  sentiment_bucket,
  nps_tag_list,
  brand_name,
  is_own_brand,
  voc_model
FROM dws_cs_voc_nps_review_df
WHERE ds = '${ds}';

-- dwb_cs_voc_record_channel_hf（5 列）
SELECT
  ds,
  spu_code,
  classification_cn,
  effective_classification_tag,
  voc_type
FROM dwb_cs_voc_record_channel_hf
WHERE ds = '${ds}';

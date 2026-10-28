-- =============================================================================
-- 02_stage_load.sql —— 把 StarRocks 导出的 CSV 灌进 staging 表
-- =============================================================================
-- 前置：01_stage_ddl.sql 已执行；CSV 已按 starrocks_export.sql 的列顺序导出。
-- 文件名必须与 staging 表名一致（pd_spu.csv → stage_pd_spu）。
--
-- 只列 staging 真实存在的列（不含 _row_no 自增列）：
--   用 \copy <表>(列清单) 而不是 COPY FROM STDIN，避免列顺序错位。
-- 编码：CSV 必须是 UTF-8，用 Excel 另存的 CSV 会是 GBK，必须先转码。
-- 空值：StarRocks 的 NULL 导出成 \N 或空串都可以，清洗函数统一按 NULL 处理。
-- 路径：默认 /data/stage；换目录就用 sed 替换这一行里的路径前缀。
-- 若 CSV 是镜像里生成的，可把 FROM '<path>' 换成 FROM PROGRAM 'cat <path> | iconv -f gbk -t utf-8'。
-- =============================================================================

\copy stage_pd_spu (ds, company_code, spu_code, spu_name, spu_name_en, spu_alias_name, spu_image, spu_level_new, spu_state, spu_state_desc, spu_product_type_desc, spu_desc, selling_point, product_line_code, product_line_name, gtm_code, gtm_name, product_leader_code, product_leader_name, planner_name, brand_code, suggest_currency, suggest_price, listing_time, is_new_spu, voc_model, category_code, category_name, category_code_level1, category_name_level1, category_code_level2, category_name_level2, category_code_level3, category_name_level3, category_code_level4, category_name_level4, category_code_level5, category_name_level5, category_tag_name, is_electrical_desc, class_tag_name, sence_tag_name, fmcg_tag_name, iot_tag_name, tag_info, series_info, model_info, deleted, update_time) FROM '/data/stage/pd_spu.csv' WITH (FORMAT csv, HEADER true);

\copy stage_pd_sku (ds, sku_code, sku_code_new, scm_sku_code, sku_name, sku_name_en, sku_image_url, sku_state, sku_state_desc, brand_code, brand_name, suggest_currency, suggest_price, spu_code, spu_name, spu_model_name, spec_product_length, spec_product_width, spec_product_height, spec_product_weight, spec_product_net_weight, spec_carton_length, spec_carton_width, spec_carton_height, spec_carton_weight, spec_carton_num, spec_material, sku_color, sku_size, sku_pack, listing_time, attr_info, sensitive_info, deleted, update_time) FROM '/data/stage/pd_sku.csv' WITH (FORMAT csv, HEADER true);

\copy stage_sal_sku_code (ds, channel, channel_name, site, shop_code, shop_name, sale_sku_code, asin, parent_asin, asin_url, sku_code, scm_sku_code, spu_code, listing_status, sal_listing_time, first_order_time, sku_suggest_currency, sku_suggest_price, sal_sku_qty, sal_image_url, category_name_level1, sal_operator_name) FROM '/data/stage/sal_sku_code.csv' WITH (FORMAT csv, HEADER true);

\copy stage_sal_sku_day (ds, order_date, platform, channel, shop, country_code, country_name, platform_sku, asin, parent_asin, sku_code, spu_code, spu_name, sku_name, sku_brand, category_name_level1, order_qty, sale_qty, sales_amount, sales_amount_usd, after_sale_replacement_qty) FROM '/data/stage/sal_sku_day.csv' WITH (FORMAT csv, HEADER true);

\copy stage_scm_stock (ds, channel_code, country_code, sku_code, warehouse_code, warehouse_name, in_stock_qty, on_way_qty) FROM '/data/stage/scm_stock.csv' WITH (FORMAT csv, HEADER true);

\copy stage_voc_nps (ds, spu_code, review_date, rating, nps_overall_sentiment, sentiment_bucket, nps_tag_list, brand_name, is_own_brand, voc_model) FROM '/data/stage/voc_nps.csv' WITH (FORMAT csv, HEADER true);

\copy stage_voc_ticket (ds, spu_code, classification_cn, effective_classification_tag, voc_type) FROM '/data/stage/voc_ticket.csv' WITH (FORMAT csv, HEADER true);

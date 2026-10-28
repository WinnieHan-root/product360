-- 8 张表各导出最新 1000 行样例数据
-- ds = 2026-10-26
-- 执行方式: mysql -h<host> -P<port> -u<user> -p<password> < export_8tables.sql
-- 或: 逐条在 StarRocks 客户端执行

SELECT * FROM lute_edw.dim_pd_spu_info_df WHERE ds='2026-10-26' LIMIT 1000;

SELECT * FROM lute_edw.dim_pd_sku_info_df WHERE ds='2026-10-26' LIMIT 1000;

SELECT * FROM lute_edw.dws_sal_sku_statistics_td_df WHERE ds='2026-10-26' LIMIT 1000;

SELECT * FROM lute_edw.dwb_scm_stock_channel_df WHERE ds='2026-10-26' LIMIT 1000;

SELECT * FROM lute_edw.dim_sal_sku_info_df WHERE ds='2026-10-26' LIMIT 1000;

SELECT * FROM lute_edw.dwb_cs_voc_record_channel_hf WHERE ds='2026-10-26' LIMIT 1000;

SELECT * FROM lute_edw.dwb_sal_return_sku_df WHERE ds='2026-10-26' LIMIT 1000;

SELECT * FROM lute_edw.dws_cs_voc_nps_review_df WHERE ds='2026-10-26' LIMIT 1000;
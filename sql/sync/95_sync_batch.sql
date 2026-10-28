-- =============================================================================
-- 95_sync_batch.sql —— 写同步批次（页面 asOf / delayed 的唯一来源）
-- =============================================================================
-- 服务层 SourceService 读 sync_batch 最近一次 status='success' 的记录：
--   source_ds → 页面上的「数据截止日期」
--   finished_at 超过 48 小时 → 页面降级成「数据延迟」
-- 所以**不写这张表，页面所有数据源都会显示延迟/未知**。每张源表每次同步写一行。
--
-- 幂等性：同一批次用同一个 batch_id；重跑会插入新批次，不影响历史。
-- =============================================================================

WITH b AS (SELECT sr_batch_id() AS batch_id), src AS (
  SELECT 'dim_pd_spu_info_df' AS source_table,
         (SELECT max(sr_day(ds)) FROM stage_pd_spu) AS source_ds,
         (SELECT count(*) FROM pd_spu) AS row_count, 'pd_spu' AS target
  UNION ALL SELECT 'dim_pd_sku_info_df', (SELECT max(sr_day(ds)) FROM stage_pd_sku), (SELECT count(*) FROM pd_sku), 'pd_sku'
  UNION ALL SELECT 'dim_sal_sku_info_df', (SELECT max(sr_day(ds)) FROM stage_sal_sku_code), (SELECT count(*) FROM sal_sku_code), 'sal_sku_code'
  UNION ALL SELECT 'dws_sal_sku_statistics_td_df', (SELECT max(sr_day(ds)) FROM stage_sal_sku_day), (SELECT count(*) FROM sal_sku_day), 'sal_sku_day'
  UNION ALL SELECT 'dwb_scm_stock_channel_df', (SELECT max(sr_day(ds)) FROM stage_scm_stock), (SELECT count(*) FROM scm_stock), 'scm_stock'
  UNION ALL SELECT 'dws_cs_voc_nps_review_df', (SELECT max(sr_day(ds)) FROM stage_voc_nps), (SELECT count(*) FROM voc_review_day), 'voc_review_day'
  UNION ALL SELECT 'dwb_cs_voc_record_channel_hf', (SELECT max(sr_day(ds)) FROM stage_voc_ticket), (SELECT count(*) FROM voc_ticket_topic), 'voc_ticket_topic'
)
INSERT INTO sync_batch (id, batch_id, source_table, source_ds, row_count, status, message, started_at, finished_at)
SELECT gen_random_uuid(), b.batch_id, src.source_table, src.source_ds, src.row_count,
       'success', src.source_table || ' → ' || src.target, now(), now()
FROM src CROSS JOIN b;

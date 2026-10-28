-- =============================================================================
-- 99_sync_batch.sql —— 写 p360_sync_batch（页面 asOf / delayed 的唯一来源）
-- =============================================================================
-- 服务层 SourceService 读 sync_batch 里每张源表**最近一条 status='success'** 的记录：
--   source_ds   → 页面上「数据截止日期」
--   finished_at → 超过 48 小时就降级成「数据延迟（delayed）」
-- 所以**这一步不能漏**：漏了页面全部字段会变成「延迟/未知」，即使数据是新的。
--
-- 幂等：batch_id 每次运行都不同（含时间戳），重跑只是多写一批历史，不影响正确性。
-- 依赖：必须在 10/11/20/21/22/30-34 全部跑完之后执行（要统计各表行数）。
-- =============================================================================

INSERT INTO p360_sync_batch
SELECT
  concat('sr-', date_format(now(), '%Y%m%d%H%i%s'), '-', src.target) AS batch_id,
  src.source_table,
  cast('${bizdate}' as date) AS source_ds,
  src.row_count,
  'success' AS status,
  concat(src.source_table, ' → ', src.target) AS message,
  now() AS started_at,
  now() AS finished_at
FROM (
  SELECT 'dim_pd_spu_info_df'         AS source_table, (SELECT count(*) FROM p360_pd_spu)            AS row_count, 'pd_spu'            AS target
  UNION ALL SELECT 'dim_pd_sku_info_df',        (SELECT count(*) FROM p360_pd_sku),            'pd_sku'
  UNION ALL SELECT 'dim_sal_sku_info_df',       (SELECT count(*) FROM p360_sal_sku_code),       'sal_sku_code'
  UNION ALL SELECT 'dws_sal_sku_statistics_td_df', (SELECT count(*) FROM p360_sal_sku_day),     'sal_sku_day'
  UNION ALL SELECT 'dwb_scm_stock_channel_df',  (SELECT count(*) FROM p360_scm_stock),          'scm_stock'
  UNION ALL SELECT 'dws_cs_voc_nps_review_df',  (SELECT count(*) FROM p360_voc_review_day),     'voc_review_day'
  UNION ALL SELECT 'dws_cs_voc_nps_review_df',  (SELECT count(*) FROM p360_voc_nps_sentiment),  'voc_nps_sentiment'
  UNION ALL SELECT 'dws_cs_voc_nps_review_df',  (SELECT count(*) FROM p360_voc_nps_tag),        'voc_nps_tag'
  UNION ALL SELECT 'dwb_cs_voc_record_channel_hf', (SELECT count(*) FROM p360_voc_ticket_topic), 'voc_ticket_topic'
  UNION ALL SELECT 'dws_cs_voc_nps_review_df',  (SELECT count(*) FROM p360_voc_competitor),     'voc_competitor'
) src;
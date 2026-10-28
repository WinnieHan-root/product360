-- =============================================================================
-- 99_verify.sql —— 同步后校验（每次跑完都该看）
-- =============================================================================

\echo '== 1) 各表行数（与源文件对照，值应为基准数）=='
SELECT 'pd_spu' AS tbl, count(*) FROM pd_spu
UNION ALL SELECT 'pd_sku', count(*) FROM pd_sku
UNION ALL SELECT 'sal_sku_code', count(*) FROM sal_sku_code
UNION ALL SELECT 'sal_sku_day', count(*) FROM sal_sku_day
UNION ALL SELECT 'scm_stock', count(*) FROM scm_stock
UNION ALL SELECT 'voc_review_day', count(*) FROM voc_review_day
UNION ALL SELECT 'voc_nps_sentiment', count(*) FROM voc_nps_sentiment
UNION ALL SELECT 'voc_nps_tag', count(*) FROM voc_nps_tag
UNION ALL SELECT 'voc_ticket_topic', count(*) FROM voc_ticket_topic
UNION ALL SELECT 'voc_competitor', count(*) FROM voc_competitor;

\echo '== 2) coverage 分布（0-4，样例基准 571/253/132/76/35）=='
SELECT coverage, count(*) FROM pd_spu GROUP BY coverage ORDER BY coverage;

\echo '== 3) 悬挂键：SKU 没有对应 SPU（源表按维度独立抽样，允许存在）=='
SELECT count(*) AS sku_without_spu FROM pd_sku k
WHERE k.spu_code IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM pd_spu s WHERE s.spu_code = k.spu_code);

\echo '== 4) 销售行的金额全空比例（应为 NULL 而不是 0）=='
SELECT count(*) AS rows,
       count(*) FILTER (WHERE sales_amount_usd IS NULL) AS usd_null,
       count(*) FILTER (WHERE sales_amount_usd = 0)     AS usd_zero
FROM sal_sku_day;

\echo '== 5) 自有/竞品口径核对（voc_competitor 不应含 is_own_brand=1 的品牌）=='
SELECT count(*) AS competitor_brands FROM voc_competitor;

\echo '== 6) 批次与数据日期（页面 asOf 来源）=='
SELECT source_table, source_ds, row_count, status, finished_at
FROM sync_batch ORDER BY finished_at DESC, source_table LIMIT 10;

\echo '== 7) 抽样 SPU 关键指标（样例基准 SPU000167：coverage=4、rating 2.98、评论 106）=='
SELECT spu_code, sku_count, channel_count, sales_30d_qty, sales_30d_usd,
       in_stock_qty, review_count, rating_avg, coverage
FROM pd_spu WHERE spu_code = 'SPU000167';

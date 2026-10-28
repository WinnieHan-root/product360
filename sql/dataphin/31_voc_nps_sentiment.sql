-- =============================================================================
-- 31_voc_nps_sentiment.sql —— dws_cs_voc_nps_review_df（自有）→ p360_voc_nps_sentiment
-- =============================================================================
-- 清洗规则（对齐 loader.ts: loadNpsSentiment）：
--   1. 只取 is_own_brand = '1' 且 spu_code / nps_overall_sentiment 非空
--   2. 粒度 = spu_code | sentiment（正向 / 中性 / 负向）
--   3. bucket = sentiment_bucket（0 最差 … 4 最好），缺失按 0
--   4. item_count = 该情绪组的评论条数
--   5. ratio = 该组条数 / 该 SPU 全部条数，保留 4 位小数
--
-- 页面「体验分布」五档条依赖 bucket；ratio 只用于占比文案，不参与排序。
-- =============================================================================

INSERT INTO p360_voc_nps_sentiment
SELECT
  a.spu_code,
  a.sentiment,
  a.ds,
  a.bucket,
  a.item_count,
  round(cast(a.item_count as decimal(18, 4)) / b.total, 4) AS ratio,
  'dws_cs_voc_nps_review_df'       AS source
FROM (
  SELECT
    s.spu_code,
    s.sentiment,
    min(s.ds)          AS ds,
    min(s.bucket)      AS bucket,
    count(*)           AS item_count
  FROM (
    SELECT
      cast(v.ds as date) AS ds,
      case when lower(cast(v.spu_code as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$' then null else regexp_replace(cast(v.spu_code as string), '^[[:space:]]+|[[:space:]]+$', '') end AS spu_code,
      case when lower(cast(v.nps_overall_sentiment as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$' then null else regexp_replace(cast(v.nps_overall_sentiment as string), '^[[:space:]]+|[[:space:]]+$', '') end AS sentiment,
      coalesce(cast(round(cast(nullif(regexp_replace(cast(v.sentiment_bucket as string), ',', ''), '') as double)) as bigint), 0) AS bucket
    FROM dws_cs_voc_nps_review_df v
    WHERE v.ds = '${bizdate}'
      AND lower(regexp_replace(cast(v.is_own_brand as string), '^[[:space:]]+|[[:space:]]+$', '')) = '1'
  ) s
  WHERE s.spu_code IS NOT NULL
    AND s.sentiment IS NOT NULL
  GROUP BY s.spu_code, s.sentiment
) a
JOIN (
  SELECT spu_code, count(*) AS total
  FROM (
    SELECT
      case when lower(cast(v.spu_code as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$' then null else regexp_replace(cast(v.spu_code as string), '^[[:space:]]+|[[:space:]]+$', '') end AS spu_code
    FROM dws_cs_voc_nps_review_df v
    WHERE v.ds = '${bizdate}'
      AND lower(regexp_replace(cast(v.is_own_brand as string), '^[[:space:]]+|[[:space:]]+$', '')) = '1'
  ) t
  WHERE t.spu_code IS NOT NULL
  GROUP BY t.spu_code
) b ON b.spu_code = a.spu_code;
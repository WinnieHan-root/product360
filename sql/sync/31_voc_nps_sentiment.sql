-- =============================================================================
-- 31_voc_nps_sentiment.sql —— dws_cs_voc_nps_review_df（自有）→ voc_nps_sentiment
-- =============================================================================
-- 清洗规则（对应 loader.ts: loadVoc 的 sentiment 分支）：
--   1. 只取 is_own_brand = 1
--   2. spu_code / nps_overall_sentiment 任一为空 → 跳过
--   3. 粒度 = spu_code | nps_overall_sentiment（五档情感分布）
--   4. bucket = sentiment_bucket（缺失按 0），用于固定档位顺序
--   5. ratio = 该档条数 / 该 SPU 全部情感条数，保留 4 位小数
-- =============================================================================

TRUNCATE TABLE voc_nps_sentiment;

WITH src AS (
  SELECT
    (SELECT max(sr_day(ds)) FROM stage_voc_nps) AS ds,
    sr_text(s.spu_code)                         AS spu_code,
    sr_text(s.nps_overall_sentiment)            AS sentiment,
    COALESCE(sr_int(s.sentiment_bucket), 0)     AS bucket
  FROM stage_voc_nps s
  WHERE sr_text(s.is_own_brand) = '1'
    AND sr_text(s.spu_code) IS NOT NULL
    AND sr_text(s.nps_overall_sentiment) IS NOT NULL
), agg AS (
  SELECT ds, spu_code, sentiment, min(bucket) AS bucket, count(*)::int AS item_count
  FROM src
  GROUP BY ds, spu_code, sentiment
)
INSERT INTO voc_nps_sentiment (id, ds, spu_code, sentiment, bucket, item_count, ratio, source)
SELECT
  gen_random_uuid(),
  a.ds, a.spu_code, a.sentiment, a.bucket, a.item_count,
  round(a.item_count::numeric / sum(a.item_count) OVER (PARTITION BY a.ds, a.spu_code), 4),
  'dws_cs_voc_nps_review_df'
FROM agg a;

-- =============================================================================
-- 30_voc_review_day.sql —— dws_cs_voc_nps_review_df（自有评论）→ voc_review_day
-- =============================================================================
-- 清洗规则（对应 loader.ts: loadVoc 的 review 分支）：
--   1. 只取 is_own_brand = 1（**自有评论口径**，竞品走 34_voc_competitor.sql）
--   2. spu_code / review_date / rating 任一为空 → 不产生该日聚合
--   3. 粒度 = spu_code | review_date
--   4. rating_avg = 平均星级，保留 3 位小数（四舍五入）
--   5. review_count = 评论条数
--   6. 注意：该源表已按「行 = 一条评论」导出；如果上游是预聚合行，
--      需改为 sum(review_count) / 加权平均，避免口径错位
-- =============================================================================

TRUNCATE TABLE voc_review_day;

WITH src AS (
  SELECT
    (SELECT max(sr_day(ds)) FROM stage_voc_nps) AS ds,
    sr_text(s.spu_code)                         AS spu_code,
    sr_day(s.review_date)                       AS review_date,
    sr_int(s.rating)                            AS rating
  FROM stage_voc_nps s
  WHERE sr_text(s.is_own_brand) = '1'
    AND sr_text(s.spu_code) IS NOT NULL
)
INSERT INTO voc_review_day (id, ds, spu_code, review_date, rating_avg, review_count, source)
SELECT
  gen_random_uuid(),
  min(ds),
  spu_code,
  review_date,
  round(avg(rating), 3),
  count(*)::int,
  'dws_cs_voc_nps_review_df'
FROM src
WHERE review_date IS NOT NULL AND rating IS NOT NULL
GROUP BY spu_code, review_date;

-- =============================================================================
-- 30_voc_review_day.sql —— dws_cs_voc_nps_review_df（is_own_brand=1）→ p360_voc_review_day
-- =============================================================================
-- 清洗规则（对齐 loader.ts: loadReviewDay）：
--   1. 只取 is_own_brand = '1'（自有品牌口径）且 spu_code 非空
--   2. review_date / rating 任一为空 → 丢弃
--   3. 粒度 = spu_code | review_date
--   4. rating_avg = 平均星级，保留 3 位小数
--   5. review_count = 评论条数
--
-- ⚠ 重要：这张源表是「一行 = 一条评论」。如果哪天上游改成预聚合行
--   （每行带 review_count），必须改成 sum(review_count) + 加权平均，否则口径错位。
-- ⚠ 这张表不参与工单主题（voc_ticket_topic 的 rating 全为 0，见 33）。
-- =============================================================================

INSERT INTO p360_voc_review_day
SELECT
  r.spu_code,
  r.review_date,
  min(r.ds)                        AS ds,
  round(avg(r.rating), 3)          AS rating_avg,
  count(*)                         AS review_count,
  'dws_cs_voc_nps_review_df'       AS source
FROM (
  SELECT
    cast(v.ds as date) AS ds,
    case when lower(cast(v.spu_code as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$' then null else regexp_replace(cast(v.spu_code as string), '^[[:space:]]+|[[:space:]]+$', '') end AS spu_code,
    cast(nullif(left(cast(v.review_date as string), 10), '') as date) AS review_date,
    cast(nullif(regexp_replace(cast(v.rating as string), ',', ''), '') as decimal(18, 4)) AS rating
  FROM dws_cs_voc_nps_review_df v
  WHERE v.ds = '${bizdate}'
    AND lower(regexp_replace(cast(v.is_own_brand as string), '^[[:space:]]+|[[:space:]]+$', '')) = '1'
) r
WHERE r.spu_code IS NOT NULL
  AND r.review_date IS NOT NULL
  AND r.rating IS NOT NULL
GROUP BY r.spu_code, r.review_date;
-- =============================================================================
-- 34_voc_competitor.sql —— dws_cs_voc_nps_review_df（竞品）→ voc_competitor
-- =============================================================================
-- 清洗规则（对应 loader.ts: loadVoc 的 competitor 分支）：
--   1. 只取 is_own_brand <> '1'（竞品评论）
--   2. brand_name 为空 → 丢弃；voc_model 为空 → '未匹配'
--   3. 粒度 = brand_name | voc_model（不区分 SPU，竞品评论不挂我方 SPU，spu_code 留 NULL）
--   4. rating 为空的评论不计入星级，只计入条数之外的分母——loader 里 rating 空则
--      该条完全不参与聚合，因此这里同样要求 rating 非空
--   5. rating_avg 保留 3 位小数
-- =============================================================================

TRUNCATE TABLE voc_competitor;

WITH src AS (
  SELECT
    (SELECT max(sr_day(ds)) FROM stage_voc_nps) AS ds,
    sr_text(s.brand_name)                       AS brand_name,
    COALESCE(sr_text(s.voc_model), '未匹配')    AS voc_model,
    sr_int(s.rating)                            AS rating
  FROM stage_voc_nps s
  WHERE sr_text(s.is_own_brand) IS DISTINCT FROM '1'
    AND sr_text(s.brand_name) IS NOT NULL
)
INSERT INTO voc_competitor (id, ds, spu_code, brand_name, voc_model, rating_avg, review_count, source)
SELECT
  gen_random_uuid(),
  min(ds), NULL, brand_name, voc_model,
  round(avg(rating), 3),
  count(*)::int,
  'dws_cs_voc_nps_review_df'
FROM src
WHERE rating IS NOT NULL
GROUP BY brand_name, voc_model
HAVING count(*) > 0;

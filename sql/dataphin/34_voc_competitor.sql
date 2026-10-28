-- =============================================================================
-- 34_voc_competitor.sql —— dws_cs_voc_nps_review_df（is_own_brand <> '1'）→ p360_voc_competitor
-- =============================================================================
-- 清洗规则（对齐 loader.ts: loadCompetitor）：
--   1. 口径是 **is_own_brand <> '1'**，不是 = '0'：
--      源数据里大量行 is_own_brand 为 NULL / 空，那些行是竞品，必须算进来。
--      等价写法：coalesce(trim(is_own_brand), '') <> '1'
--   2. brand_name / voc_model 任一为空 → 丢弃（这俩是业务主键）
--   3. 粒度 = brand_name | voc_model
--   4. rating_avg = 加权平均星级（按评论条数加权），保留 3 位小数
--   5. review_count = 评论条数
--   6. spu_code 恒为 NULL：竞品没有内部 SPU 编码，PG 里这列允许空，保留只为对齐结构
-- =============================================================================

INSERT INTO p360_voc_competitor
SELECT
  c.brand_name,
  c.voc_model,
  c.ds,
  cast(null as varchar(64)) AS spu_code,
  c.rating_avg,
  c.review_count,
  'dws_cs_voc_nps_review_df' AS source
FROM (
  SELECT
    s.brand_name,
    s.voc_model,
    min(s.ds) AS ds,
    round(sum(s.rating) / nullif(count(s.rating), 0), 3) AS rating_avg,
    count(*)  AS review_count
  FROM (
    SELECT
      cast(v.ds as date) AS ds,
      case when lower(cast(v.brand_name as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$'
           then null
           else regexp_replace(cast(v.brand_name as string), '^[[:space:]]+|[[:space:]]+$', '') end AS brand_name,
      case when lower(cast(v.voc_model as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$'
           then null
           else regexp_replace(cast(v.voc_model as string), '^[[:space:]]+|[[:space:]]+$', '') end AS voc_model,
      cast(nullif(regexp_replace(cast(v.rating as string), ',', ''), '') as decimal(18, 4)) AS rating
    FROM dws_cs_voc_nps_review_df v
    WHERE v.ds = '${bizdate}'
      AND lower(regexp_replace(coalesce(cast(v.is_own_brand as string), ''), '^[[:space:]]+|[[:space:]]+$', '')) <> '1'
  ) s
  WHERE s.brand_name IS NOT NULL
    AND s.voc_model IS NOT NULL
  GROUP BY s.brand_name, s.voc_model
) c;
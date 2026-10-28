-- =============================================================================
-- 32_voc_nps_tag.sql —— dws_cs_voc_nps_review_df（自有）→ voc_nps_tag
-- =============================================================================
-- 清洗规则（对应 loader.ts: loadVoc 的 tag 分支）：
--   1. 只取 is_own_brand = 1，且 spu_code 非空
--   2. nps_tag_list 是 JSON 数组，**要展开成一行一个因子**：
--      [{"tag_name":"静音","tag_sentiment":"正向"}, ...]
--   3. tag_name 去空白后为空 → 跳过该元素；tag_sentiment 可以是 NULL
--   4. 粒度 = spu_code | tag_name | sentiment，tag_count 为出现次数
--   5. ratio = 该因子次数 / 该 SPU 全部因子次数，保留 4 位小数
--   6. 非法 JSON / 非数组 → 整行跳过（sr_json 已把解析失败转 NULL）
-- =============================================================================

TRUNCATE TABLE voc_nps_tag;

WITH src AS (
  SELECT
    (SELECT max(sr_day(ds)) FROM stage_voc_nps) AS ds,
    sr_text(s.spu_code)                         AS spu_code,
    sr_json(s.nps_tag_list)                     AS tags
  FROM stage_voc_nps s
  WHERE sr_text(s.is_own_brand) = '1'
    AND sr_text(s.spu_code) IS NOT NULL
), exploded AS (
  SELECT
    src.ds,
    src.spu_code,
    NULLIF(sr_trim(item ->> 'tag_name'), '')      AS tag_name,
    NULLIF(sr_trim(item ->> 'tag_sentiment'), '') AS sentiment
  FROM src
  CROSS JOIN LATERAL jsonb_array_elements(src.tags) AS item
  WHERE jsonb_typeof(src.tags) = 'array'
), agg AS (
  SELECT ds, spu_code, tag_name, sentiment, count(*)::int AS tag_count
  FROM exploded
  WHERE tag_name IS NOT NULL
  GROUP BY ds, spu_code, tag_name, sentiment
)
INSERT INTO voc_nps_tag (id, ds, spu_code, tag_name, sentiment, tag_count, ratio, source)
SELECT
  gen_random_uuid(),
  a.ds, a.spu_code, a.tag_name, a.sentiment, a.tag_count,
  round(a.tag_count::numeric / sum(a.tag_count) OVER (PARTITION BY a.ds, a.spu_code), 4),
  'dws_cs_voc_nps_review_df'
FROM agg a;

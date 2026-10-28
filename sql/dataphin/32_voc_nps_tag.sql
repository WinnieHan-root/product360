-- =============================================================================
-- 32_voc_nps_tag.sql —— dws_cs_voc_nps_review_df（自有）→ p360_voc_nps_tag
-- =============================================================================
-- 清洗规则（对齐 loader.ts: loadNpsTag）：
--   1. 只取 is_own_brand = '1' 且 spu_code 非空
--   2. nps_tag_list 是 JSON 数组，元素形如
--      {"tag_id":..,"tag_name":"..","tag_sentiment":"正向","tag_confidence":..,"tag_quality":..}
--      **一个元素展开成一行**
--   3. tag_name 为空 → 跳过该元素；非法 JSON / 非数组 → 整行跳过
--   4. 粒度 = spu_code | tag_name | sentiment，tag_count = 出现次数
--   5. ratio = 该因子次数 / 该 SPU 全部因子次数，保留 4 位小数
--
-- 数组展开方式：SR 没有 jsonb_array_elements，用「0-9 数字辅助表 + json_length」
-- 做笛卡尔积再过滤。样例数据里单个 nps_tag_list 最多 5 个元素（实测），
-- 0..9 足够；若上游可能超过 10 个，把 nums 扩到 0..29。
-- =============================================================================

INSERT INTO p360_voc_nps_tag
SELECT
  a.spu_code,
  a.tag_name,
  a.sentiment,
  a.ds,
  a.tag_count,
  round(cast(a.tag_count as decimal(18, 4)) / b.total, 4) AS ratio,
  'dws_cs_voc_nps_review_df' AS source
FROM (
  SELECT
    e.spu_code,
    e.tag_name,
    e.sentiment,
    min(e.ds) AS ds,
    count(*)  AS tag_count
  FROM (
    SELECT
      cast(v.ds as date) AS ds,
      case when lower(cast(v.spu_code as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$'
           then null
           else regexp_replace(cast(v.spu_code as string), '^[[:space:]]+|[[:space:]]+$', '') end AS spu_code,
      -- 元素按序号取出来（get_json_string 返回不带引号的字符串）
      regexp_replace(
        coalesce(get_json_string(get_json_string(parse_json(cast(v.nps_tag_list as string)),
                                                concat('$[', n.num, ']')), '$.tag_name'), ''),
        '^[[:space:]]+|[[:space:]]+$', ''
      ) AS tag_name,
      regexp_replace(
        coalesce(get_json_string(get_json_string(parse_json(cast(v.nps_tag_list as string)),
                                                concat('$[', n.num, ']')), '$.tag_sentiment'), ''),
        '^[[:space:]]+|[[:space:]]+$', ''
      ) AS sentiment
    FROM dws_cs_voc_nps_review_df v
    CROSS JOIN (
      SELECT 0 AS num UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
      UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9
    ) n
    WHERE v.ds = '${bizdate}'
      AND lower(regexp_replace(cast(v.is_own_brand as string), '^[[:space:]]+|[[:space:]]+$', '')) = '1'
      AND n.num < json_length(parse_json(cast(v.nps_tag_list as string)))
  ) e
  WHERE e.spu_code IS NOT NULL
    AND e.tag_name <> ''
  GROUP BY e.spu_code, e.tag_name, e.sentiment
) a
JOIN (
  -- 分母 = 该 SPU 打标总数（nps_tag_list 里有效的因子个数）
  SELECT spu_code, count(*) AS total
  FROM (
    SELECT
      case when lower(cast(v.spu_code as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$'
           then null
           else regexp_replace(cast(v.spu_code as string), '^[[:space:]]+|[[:space:]]+$', '') end AS spu_code,
      n.num,
      regexp_replace(
        coalesce(get_json_string(get_json_string(parse_json(cast(v.nps_tag_list as string)),
                                                concat('$[', n.num, ']')), '$.tag_name'), ''),
        '^[[:space:]]+|[[:space:]]+$', ''
      ) AS tag_name
    FROM dws_cs_voc_nps_review_df v
    CROSS JOIN (
      SELECT 0 AS num UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
      UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9
    ) n
    WHERE v.ds = '${bizdate}'
      AND lower(regexp_replace(cast(v.is_own_brand as string), '^[[:space:]]+|[[:space:]]+$', '')) = '1'
      AND n.num < json_length(parse_json(cast(v.nps_tag_list as string)))
  ) t
  WHERE t.spu_code IS NOT NULL
    AND t.tag_name <> ''
  GROUP BY t.spu_code
) b ON b.spu_code = a.spu_code;
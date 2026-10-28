-- =============================================================================
-- 33_voc_ticket_topic.sql —— dwb_cs_voc_record_channel_hf → p360_voc_ticket_topic
-- =============================================================================
-- 清洗规则（对齐 loader.ts: loadTicketTopic）：
--   1. spu_code 非空者入表（源表没有 is_own_brand 口径，工单本身都是自有）
--   2. topic 取值顺序：classification_cn → effective_classification_tag → '未分类'
--   3. 粒度 = spu_code | topic，ticket_count = 工单数
--   4. voc_type 取该组出现次数最多的类型
--      ⚠ 并列时 loader 取「先出现的」（JS 稳定排序），SR 版按字典序取第一个。
--        仅影响 voc_type 文案，不影响计数/占比；样例数据上无并列，故验证结果一致。（有并列按字典序，保证可重跑）
--   5. ratio = 该主题工单数 / 该 SPU 工单总数，保留 4 位小数
--
-- ⚠ 该源表 rating 全为 0，只用于主题分类，**不参与星级计算**（星级看 30）。
-- =============================================================================

INSERT INTO p360_voc_ticket_topic
SELECT
  a.spu_code,
  a.topic,
  a.ds,
  m.voc_type,
  a.ticket_count,
  round(cast(a.ticket_count as decimal(18, 4)) / b.total, 4) AS ratio,
  'dwb_cs_voc_record_channel_hf' AS source
FROM (
  SELECT
    s.spu_code,
    s.topic,
    min(s.ds) AS ds,
    count(*)  AS ticket_count
  FROM (
    SELECT
      cast(v.ds as date) AS ds,
      case when lower(cast(v.spu_code as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$'
           then null
           else regexp_replace(cast(v.spu_code as string), '^[[:space:]]+|[[:space:]]+$', '') end AS spu_code,
      -- 主题三级回退
      coalesce(
        nullif(regexp_replace(cast(v.classification_cn as string), '^[[:space:]]+|[[:space:]]+$', ''), ''),
        nullif(regexp_replace(cast(v.effective_classification_tag as string), '^[[:space:]]+|[[:space:]]+$', ''), ''),
        '未分类'
      ) AS topic,
      case when lower(cast(v.voc_type as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$'
           then null
           else regexp_replace(cast(v.voc_type as string), '^[[:space:]]+|[[:space:]]+$', '') end AS voc_type
    FROM dwb_cs_voc_record_channel_hf v
    WHERE v.ds = '${bizdate}'
  ) s
  WHERE s.spu_code IS NOT NULL
  GROUP BY s.spu_code, s.topic
) a
-- 分母：该 SPU 工单总数
JOIN (
  SELECT spu_code, count(*) AS total
  FROM (
    SELECT
      case when lower(cast(v.spu_code as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$'
           then null
           else regexp_replace(cast(v.spu_code as string), '^[[:space:]]+|[[:space:]]+$', '') end AS spu_code
    FROM dwb_cs_voc_record_channel_hf v
    WHERE v.ds = '${bizdate}'
  ) t
  WHERE t.spu_code IS NOT NULL
  GROUP BY t.spu_code
) b ON b.spu_code = a.spu_code
-- 众数 voc_type
LEFT JOIN (
  SELECT spu_code, topic, voc_type FROM (
    SELECT c.spu_code, c.topic, c.voc_type,
           row_number() OVER (PARTITION BY c.spu_code, c.topic ORDER BY c.cnt DESC, c.voc_type) AS rn
    FROM (
      SELECT
        case when lower(cast(v.spu_code as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$'
             then null
             else regexp_replace(cast(v.spu_code as string), '^[[:space:]]+|[[:space:]]+$', '') end AS spu_code,
        coalesce(
          nullif(regexp_replace(cast(v.classification_cn as string), '^[[:space:]]+|[[:space:]]+$', ''), ''),
          nullif(regexp_replace(cast(v.effective_classification_tag as string), '^[[:space:]]+|[[:space:]]+$', ''), ''),
          '未分类'
        ) AS topic,
        case when lower(cast(v.voc_type as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$'
             then null
             else regexp_replace(cast(v.voc_type as string), '^[[:space:]]+|[[:space:]]+$', '') end AS voc_type
      FROM dwb_cs_voc_record_channel_hf v
      WHERE v.ds = '${bizdate}'
    ) c
    WHERE c.spu_code IS NOT NULL AND c.voc_type IS NOT NULL
    GROUP BY c.spu_code, c.topic, c.voc_type
  ) r
  WHERE r.rn = 1
) m ON m.spu_code = a.spu_code AND m.topic = a.topic;
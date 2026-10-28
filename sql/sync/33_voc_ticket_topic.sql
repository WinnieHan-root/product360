-- =============================================================================
-- 33_voc_ticket_topic.sql —— dwb_cs_voc_record_channel_hf → voc_ticket_topic
-- =============================================================================
-- 清洗规则（对应 loader.ts: loadTicketTopic）：
--   1. spu_code 为空 → 丢弃
--   2. topic 取值优先级：classification_cn → effective_classification_tag → '未分类'
--   3. 粒度 = spu_code | topic；ticket_count 为工单条数
--   4. voc_type 取该主题下出现最多的类型（众数）
--   5. ratio = 该主题条数 / 该 SPU 全部工单条数，保留 4 位小数
--   6. **该表 rating 全为 0，只用于主题分类，不参与星级计算**（见 30_voc_review_day.sql）
-- =============================================================================

TRUNCATE TABLE voc_ticket_topic;

WITH src AS (
  SELECT
    (SELECT max(sr_day(ds)) FROM stage_voc_ticket) AS ds,
    sr_text(s.spu_code)                            AS spu_code,
    COALESCE(sr_text(s.classification_cn), sr_text(s.effective_classification_tag), '未分类') AS topic,
    sr_text(s.voc_type)                            AS voc_type
  FROM stage_voc_ticket s
  WHERE sr_text(s.spu_code) IS NOT NULL
), agg AS (
  SELECT ds, spu_code, topic, count(*)::int AS ticket_count
  FROM src
  GROUP BY ds, spu_code, topic
), voc_type_mode AS (
  SELECT ds, spu_code, topic, voc_type
  FROM (
    SELECT ds, spu_code, topic, voc_type,
           row_number() OVER (PARTITION BY ds, spu_code, topic ORDER BY cnt DESC, voc_type) AS rn
    FROM (
      SELECT ds, spu_code, topic, voc_type, count(*) AS cnt
      FROM src
      WHERE voc_type IS NOT NULL
      GROUP BY ds, spu_code, topic, voc_type
    ) c
  ) r
  WHERE rn = 1
)
INSERT INTO voc_ticket_topic (id, ds, spu_code, topic, voc_type, ticket_count, ratio, source)
SELECT
  gen_random_uuid(),
  a.ds, a.spu_code, a.topic, m.voc_type, a.ticket_count,
  round(a.ticket_count::numeric / sum(a.ticket_count) OVER (PARTITION BY a.ds, a.spu_code), 4),
  'dwb_cs_voc_record_channel_hf'
FROM agg a
LEFT JOIN voc_type_mode m USING (ds, spu_code, topic);

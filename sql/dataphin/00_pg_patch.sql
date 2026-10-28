-- =============================================================================
-- 00_pg_patch.sql —— PG 侧一次性结构补丁（只跑一次，在目标 PG 上执行）
-- =============================================================================
-- 为什么需要：
--   Prisma 的 `@id @default(uuid())` 是**客户端**默认值，PG 表上并没有 DEFAULT。
--   Dataphin 集成任务不映射 id 列时，插入会报 null value in column "id"。
--   补上 DB 默认值即可，对 Prisma 完全无影响（Prisma 仍会自己生成 uuid）。
--
-- 前提：PG >= 13（gen_random_uuid() 已内建）。PG < 13 需先 CREATE EXTENSION pgcrypto;
--
-- 执行：psql -f 00_pg_patch.sql（或用 Dataphin 的「一次性 SQL 任务」）
-- 回滚：ALTER TABLE xxx ALTER COLUMN id DROP DEFAULT;
-- =============================================================================

ALTER TABLE pd_spu               ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE pd_sku               ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE sal_sku_code         ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE sal_sku_day          ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE scm_stock            ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE voc_review_day       ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE voc_nps_sentiment    ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE voc_nps_tag          ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE voc_ticket_topic     ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE voc_competitor       ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE sync_batch           ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- 校验：每张表都应有 gen_random_uuid() 默认值
SELECT table_name, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND column_name = 'id'
  AND table_name IN ('pd_spu','pd_sku','sal_sku_code','sal_sku_day','scm_stock',
                     'voc_review_day','voc_nps_sentiment','voc_nps_tag',
                     'voc_ticket_topic','voc_competitor','sync_batch')
ORDER BY table_name;
-- =============================================================================
-- 01_sr_tables.sql —— Dataphin / StarRocks 侧输出中间表 DDL（一次性执行）
-- =============================================================================
-- 分层约定：
--   源表（SR 数仓）  →  p360_*（本文件，SR 中间表）  →  PG public.xxx（集成任务）
--   表名 = p360_ + PG 表名，字段与 PG 完全同名同序，集成任务可以做「同名映射」。
--   如果你们规范要求 dwd_/dws_ 前缀，全局替换 `p360_` 即可。
--
-- 为什么用 DUPLICATE KEY 而不是 PRIMARY KEY：
--   PRIMARY KEY 模型要求所有 key 列 NOT NULL，而 shop_code / site / warehouse_code
--   这些维度在源数据里真的会为空（不能为了建表去造值）。所以用 DUPLICATE KEY，
--   幂等靠「每次任务前清表 / 集成任务用覆盖写」保证（见 README 第 4 节）。
--
-- 类型：deleted/coverage/xxx_count 用 int；金额金额用 decimal 对齐 PG 精度；
--       JSON 列用 json；market_countries 输出成 PG 数组字面量 `{US,DE}` 存在 varchar。
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. pd_spu（SPU 主档 + 预聚合列）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS p360_pd_spu (
  spu_code               varchar(64)   NOT NULL COMMENT 'SPU 编码（业务主键）',
  ds                     date          NOT NULL COMMENT '源数据分区日',
  company_code           varchar(64),
  spu_name               varchar(512)  NOT NULL,
  spu_name_en            varchar(512),
  spu_alias_name         varchar(512),
  spu_image              string,
  spu_level_new          varchar(128),
  spu_state              int,
  spu_state_desc         varchar(64),
  spu_model_name         varchar(255),
  spu_product_type_desc  varchar(512),
  spu_desc               string,
  selling_point          string,
  product_line_code      varchar(64),
  product_line_name      varchar(255),
  gtm_code               varchar(64),
  gtm_name               varchar(255),
  product_leader_code    varchar(64),
  product_leader_name    varchar(255),
  planner_name           varchar(255),
  brand_code             varchar(64),
  suggest_currency       varchar(16),
  suggest_price          decimal(14, 4),
  listing_time           datetime,
  is_new_spu             int,
  voc_model              varchar(255),
  category_code          varchar(64),
  category_name          varchar(255),
  category_code_level1   varchar(64),
  category_name_level1   varchar(255),
  category_code_level2   varchar(64),
  category_name_level2   varchar(255),
  category_code_level3   varchar(64),
  category_name_level3   varchar(255),
  category_code_level4   varchar(64),
  category_name_level4   varchar(255),
  category_code_level5   varchar(64),
  category_name_level5   varchar(255),
  category_tag_name      varchar(512),
  is_electrical_desc     varchar(64),
  class_tag_name         varchar(512),
  sence_tag_name         varchar(512),
  fmcg_tag_name          varchar(512),
  iot_tag_name           varchar(512),
  tag_info               json,
  series_info            json,
  model_info             json,
  deleted                int,
  update_time            datetime,
  -- 以下为预聚合列（由 11_pd_spu.sql 一次算好）
  coverage               int           COMMENT '0-4：SKU/渠道/销量/口碑 各计 1',
  sku_count              int,
  channel_count          int,
  has_sales              boolean,
  market_countries       varchar(512)  COMMENT 'PG text[] 字面量，如 {US,DE}；无数据为 {}',
  sales_30d_qty          int,
  sales_30d_usd          decimal(16, 4) COMMENT '全为 NULL 时保持 NULL（页面显示未接入）',
  in_stock_qty           int,
  on_way_qty             int,
  review_count           int,
  rating_avg             decimal(4, 3)
) DUPLICATE KEY(spu_code, ds)
COMMENT '商品中心 360 - SPU 主档（→ PG pd_spu）';

-- ---------------------------------------------------------------------------
-- 2. pd_sku（SKU 主档）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS p360_pd_sku (
  sku_code               varchar(64)   NOT NULL,
  ds                     date          NOT NULL,
  sku_code_new           varchar(64),
  scm_sku_code           varchar(64),
  sku_name               varchar(512)  NOT NULL,
  sku_name_en            varchar(512),
  sku_image_url          string,
  sku_state              int,
  sku_state_desc         varchar(64),
  brand_code             varchar(64),
  brand_name             varchar(255),
  suggest_currency       varchar(16),
  suggest_price          decimal(14, 4),
  spu_code               varchar(64),
  spu_name               varchar(512),
  spu_model_name         varchar(255),
  spec_product_length    decimal(12, 4),
  spec_product_width     decimal(12, 4),
  spec_product_height    decimal(12, 4),
  spec_product_weight    decimal(12, 4),
  spec_product_net_weight decimal(12, 4),
  spec_carton_length     decimal(12, 4),
  spec_carton_width      decimal(12, 4),
  spec_carton_height     decimal(12, 4),
  spec_carton_weight     decimal(12, 4),
  spec_carton_num        int,
  spec_material          varchar(512),
  sku_color              varchar(128),
  sku_size               varchar(128),
  sku_pack               varchar(255),
  listing_time           datetime,
  attr_info              json,
  sensitive_info         json,
  deleted                int,
  update_time            datetime
) DUPLICATE KEY(sku_code, ds)
COMMENT '商品中心 360 - SKU 主档（→ PG pd_sku）';

-- ---------------------------------------------------------------------------
-- 3. sal_sku_code（渠道外部编码：ASIN / 平台 SKU）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS p360_sal_sku_code (
  channel                varchar(64)   NOT NULL,
  site                   varchar(64)   NOT NULL,
  shop_code              varchar(128)  NOT NULL,
  sale_sku_code          varchar(128)  NOT NULL,
  sku_code               varchar(64)   NOT NULL,
  ds                     date          NOT NULL,
  channel_name           varchar(128),
  shop_name              varchar(255),
  asin                   varchar(64),
  parent_asin            varchar(64),
  asin_url               string,
  scm_sku_code           varchar(64),
  spu_code               varchar(64),
  listing_status         varchar(64),
  sal_listing_time       datetime,
  first_order_time       datetime,
  suggest_currency       varchar(16),
  suggest_price          decimal(14, 4),
  sale_sku_qty           int,
  sal_image_url          string,
  category_name_level1   varchar(255),
  listing_operator       varchar(255)
) DUPLICATE KEY(channel, site, shop_code, sale_sku_code, sku_code)
COMMENT '商品中心 360 - 渠道外部编码（→ PG sal_sku_code）';

-- ---------------------------------------------------------------------------
-- 4. sal_sku_day（销售日汇总）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS p360_sal_sku_day (
  order_date             date          NOT NULL,
  platform               varchar(64)   NOT NULL,
  shop                   varchar(128)  NOT NULL,
  country_code           varchar(16)   NOT NULL,
  platform_sku           varchar(128)  NOT NULL,
  ds                     date          NOT NULL,
  channel                varchar(64),
  country_name           varchar(128),
  asin                   varchar(64),
  parent_asin            varchar(64),
  sku_code               varchar(64),
  spu_code               varchar(64),
  spu_name               varchar(512),
  sku_name               varchar(512),
  brand_code             varchar(64),
  category_name_level1   varchar(255),
  order_qty              int,
  sale_qty               int,
  sales_amount           decimal(16, 4) COMMENT '全为 NULL 时保持 NULL',
  sales_amount_usd       decimal(16, 4) COMMENT '全为 NULL 时保持 NULL',
  after_sale_replacement_qty int COMMENT '售后换货数量，页面叫 return_qty'
) DUPLICATE KEY(order_date, platform, shop, country_code, platform_sku)
COMMENT '商品中心 360 - 销售日汇总（→ PG sal_sku_day）';

-- ---------------------------------------------------------------------------
-- 5. scm_stock（渠道库存）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS p360_scm_stock (
  channel_code           varchar(64)   NOT NULL,
  country_code           varchar(16)   NOT NULL,
  sku_code               varchar(64)   NOT NULL,
  warehouse_code         varchar(64)   NOT NULL,
  ds                     date          NOT NULL,
  warehouse_name         varchar(255),
  in_stock_qty           int,
  on_way_qty             int
) DUPLICATE KEY(channel_code, country_code, sku_code, warehouse_code)
COMMENT '商品中心 360 - 渠道库存（→ PG scm_stock）';

-- ---------------------------------------------------------------------------
-- 6. voc_review_day（自有评论日汇总）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS p360_voc_review_day (
  spu_code               varchar(64)   NOT NULL,
  review_date            date          NOT NULL,
  ds                     date          NOT NULL,
  rating_avg             decimal(4, 3),
  review_count           int,
  source                 varchar(128)
) DUPLICATE KEY(spu_code, review_date)
COMMENT '商品中心 360 - 评论日汇总（→ PG voc_review_day）';

-- ---------------------------------------------------------------------------
-- 7. voc_nps_sentiment（NPS 五档情绪分布）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS p360_voc_nps_sentiment (
  spu_code               varchar(64)   NOT NULL,
  sentiment              varchar(64)   NOT NULL,
  ds                     date          NOT NULL,
  bucket                 int           COMMENT '0 差 … 4 好',
  item_count             int,
  ratio                  decimal(6, 4),
  source                 varchar(128)
) DUPLICATE KEY(spu_code, sentiment)
COMMENT '商品中心 360 - NPS 情绪分布（→ PG voc_nps_sentiment）';

-- ---------------------------------------------------------------------------
-- 8. voc_nps_tag（体验因子；nps_tag_list 数组展开后一行一个因子）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS p360_voc_nps_tag (
  spu_code               varchar(64)   NOT NULL,
  tag_name               varchar(255)  NOT NULL,
  sentiment              varchar(64)   NOT NULL,
  ds                     date          NOT NULL,
  tag_count              int,
  ratio                  decimal(6, 4),
  source                 varchar(128)
) DUPLICATE KEY(spu_code, tag_name, sentiment)
COMMENT '商品中心 360 - 体验因子（→ PG voc_nps_tag）';

-- ---------------------------------------------------------------------------
-- 9. voc_ticket_topic（工单主题）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS p360_voc_ticket_topic (
  spu_code               varchar(64)   NOT NULL,
  topic                  varchar(255)  NOT NULL,
  ds                     date          NOT NULL,
  voc_type               varchar(64),
  ticket_count           int,
  ratio                  decimal(6, 4),
  source                 varchar(128)
) DUPLICATE KEY(spu_code, topic)
COMMENT '商品中心 360 - 工单主题（→ PG voc_ticket_topic）';

-- ---------------------------------------------------------------------------
-- 10. voc_competitor（竞品口碑）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS p360_voc_competitor (
  brand_name             varchar(255)  NOT NULL,
  voc_model              varchar(255)  NOT NULL,
  ds                     date          NOT NULL,
  spu_code               varchar(64)   COMMENT '竞品行恒为 NULL，保留列只为对齐 PG 结构',
  rating_avg             decimal(4, 3),
  review_count           int,
  source                 varchar(128)
) DUPLICATE KEY(brand_name, voc_model)
COMMENT '商品中心 360 - 竞品口碑（→ PG voc_competitor）';

-- ---------------------------------------------------------------------------
-- 11. sync_batch（同步批次；页面 asOf / delayed 的唯一来源，不能漏）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS p360_sync_batch (
  batch_id               varchar(64)   NOT NULL,
  source_table           varchar(128)  NOT NULL,
  source_ds              date,
  row_count              int,
  status                 varchar(16),
  message                varchar(1024),
  started_at             datetime,
  finished_at            datetime
) DUPLICATE KEY(batch_id, source_table)
COMMENT '商品中心 360 - 同步批次（→ PG sync_batch）';
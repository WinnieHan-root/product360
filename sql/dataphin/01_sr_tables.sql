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
  spu_code               varchar(64)   NOT NULL COMMENT 'SPU 编码，业务主键，一个商品一行',
  ds                     date          NOT NULL COMMENT '源表 ds 分区日，取行内值（不是 max 子查询）',
  company_code           varchar(64)   COMMENT '公司编码，多公司口径预留，页面不展示',
  spu_name               varchar(512)  NOT NULL COMMENT '商品名称（中文），列表主标题',
  spu_name_en            varchar(512)  COMMENT '商品英文名，模糊检索第二字段',
  spu_alias_name         varchar(512)  COMMENT '商品别名',
  spu_image              string        COMMENT '商品主图 URL',
  spu_level_new          varchar(128)  COMMENT '商品等级（新），页面徽标',
  spu_state              int           COMMENT '状态码：0 开发中 / 1 待上架 / 2 可销售 / 3 已下架 / 5 已取消（无 4）',
  spu_state_desc         varchar(64)   COMMENT '状态描述，页面直接展示；源端为空时兜底「待上架」',
  spu_model_name         varchar(255)  COMMENT '型号名，取 model_info.model_name，无则取任一 SKU 的值',
  spu_product_type_desc  varchar(512)  COMMENT '产品类型描述',
  spu_desc               string        COMMENT '商品长描述',
  selling_point          string        COMMENT '卖点文案',
  product_line_code      varchar(64)   COMMENT '产品线编码',
  product_line_name      varchar(255)  COMMENT '产品线名称',
  gtm_code               varchar(64)   COMMENT 'GTM 负责人工号',
  gtm_name               varchar(255)  COMMENT 'GTM 负责人姓名；质量告警「缺关键角色」判它是否为空',
  product_leader_code    varchar(64)   COMMENT '产品负责人工号',
  product_leader_name    varchar(255)  COMMENT '产品负责人姓名；质量告警判它是否为空',
  planner_name           varchar(255)  COMMENT '计划人员姓名；质量告警判它是否为空',
  brand_code             varchar(64)   COMMENT '品牌编码，是权限 scope 的过滤键之一',
  suggest_currency       varchar(16)   COMMENT '建议售价币种',
  suggest_price          decimal(14, 4) COMMENT '建议售价，商业字段：无权限时接口置 NULL',
  listing_time           datetime      COMMENT '上架时间；抽样覆盖仅 76%，空值不等于未上市，不要拿它推生命周期',
  is_new_spu             int           COMMENT '新品标记；本地抽样全为 NULL（源端未给值），页面不展示',
  voc_model              varchar(255)  COMMENT '口碑口径型号，关联竞品表用',
  category_code          varchar(64)   COMMENT '类目完整编码路径',
  category_name          varchar(255)  COMMENT '类目完整名称路径',
  category_code_level1   varchar(64)   COMMENT '一级类目编码；四级级联筛选的 L1 键',
  category_name_level1   varchar(255)  COMMENT '一级类目名称',
  category_code_level2   varchar(64)   COMMENT '二级类目编码；L2 键',
  category_name_level2   varchar(255)  COMMENT '二级类目名称',
  category_code_level3   varchar(64)   COMMENT '三级类目编码；L3 键',
  category_name_level3   varchar(255)  COMMENT '三级类目名称',
  category_code_level4   varchar(64)   COMMENT '四级类目编码；L4 键（级联到此为止）',
  category_name_level4   varchar(255)  COMMENT '四级类目名称',
  category_code_level5   varchar(64)   COMMENT '五级类目编码；抽样中 100% 为空，级联已砍掉 L5，勿启用',
  category_name_level5   varchar(255)  COMMENT '五级类目名称',
  category_tag_name      varchar(512)  COMMENT '类目标签串',
  is_electrical_desc     varchar(64)   COMMENT '是否带电描述',
  class_tag_name         varchar(512)  COMMENT '分类标签串',
  sence_tag_name         varchar(512)  COMMENT '场景标签串（源端拼写 sence，勿改为 scene，否则映射断裂）',
  fmcg_tag_name          varchar(512)  COMMENT '快消标签串',
  iot_tag_name           varchar(512)  COMMENT 'IoT 标签串',
  tag_info               json          COMMENT '标签原始 JSON，原样透传',
  series_info            json          COMMENT '系列原始 JSON，原样透传',
  model_info             json          COMMENT '型号原始 JSON，spu_model_name 从这里取',
  deleted                int           COMMENT '源端删除标记 0/1（本地抽样全为 0）；不是软删除主键，排查孤行时才看',
  update_time            datetime      COMMENT '源表更新时间；SR 侧去重排序依据（取最新一条）',
  -- 以下为预聚合列（由 11_pd_spu.sql 一次算好，请求期不再跨表聚合）
  coverage               int           COMMENT '数据覆盖度 0-4：有 SKU / 有渠道编码 / 有销量 / 有口碑 各计 1，列表默认按它倒序',
  sku_count              int           COMMENT '该 SPU 的 SKU 数，来自 pd_sku 计数',
  channel_count          int           COMMENT '该 SPU 出现过的渠道数，来自 sal_sku_code 去重计数',
  has_sales              boolean       COMMENT '近 30 天是否有销量，列表筛选用',
  market_countries       varchar(512)  COMMENT '销售覆盖国家，PG text[] 字面量如 {US,DE}；无数据为 {}',
  sales_30d_qty          int           COMMENT '近 30 天销量，无销量为 0',
  sales_30d_usd          decimal(16, 4) COMMENT '近 30 天销售额（USD），商业字段；源数据全为 NULL 时保持 NULL，不填 0',
  in_stock_qty           int           COMMENT '在库数量，来自 scm_stock 汇总',
  on_way_qty             int           COMMENT '在途数量，来自 scm_stock 汇总',
  review_count           int           COMMENT '评论总数，来自自有评论（is_own_brand=1）',
  rating_avg             decimal(4, 3) COMMENT '评论星级均值 0-5',
  lifecycle_stage        varchar(16)   COMMENT '运营生命周期 selling/prelaunch/clearance/retired，加载期算好；优先级 retired > clearance > prelaunch > selling'
) DUPLICATE KEY(spu_code, ds)
COMMENT '商品中心 360 - SPU 主档（→ PG pd_spu）。一 SPU 一行；后 12 列为加载期预聚合，勿在查询期重算';

-- 已有表升级（P2-3 生命周期列）：CREATE TABLE IF NOT EXISTS 不会给已存在的表补列，
-- 所以表已经建过的环境必须补跑这一条，否则 11_pd_spu.sql 的 INSERT 会因列数不匹配报错。
-- ALTER TABLE p360_pd_spu ADD COLUMN lifecycle_stage varchar(16) COMMENT 'selling/prelaunch/clearance/retired，加载期算好' AFTER rating_avg;

-- ---------------------------------------------------------------------------
-- 2. pd_sku（SKU 主档）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS p360_pd_sku (
  sku_code               varchar(64)   NOT NULL COMMENT 'SKU 编码，业务主键',
  ds                     date          NOT NULL COMMENT '源表 ds 分区日',
  sku_code_new           varchar(64)   COMMENT '新 SKU 编码（编码迁移中间态）',
  scm_sku_code           varchar(64)   COMMENT '供应链 SKU 编码，关联库存表的中间键',
  sku_name               varchar(512)  NOT NULL COMMENT 'SKU 名称；源端为空时兜底用 sku_code',
  sku_name_en            varchar(512)  COMMENT 'SKU 英文名',
  sku_image_url          string        COMMENT 'SKU 主图 URL',
  sku_state              int           COMMENT '状态码：0 已取消 / 1 未上架 / 2 在销售 / 3 清仓中 / 4 已退市',
  sku_state_desc         varchar(64)   COMMENT '状态描述，页面直接展示；lifecycle 的 clearance 判定读它',
  brand_code             varchar(64)   COMMENT '品牌编码',
  brand_name             varchar(255)  COMMENT '品牌名称',
  suggest_currency       varchar(16)   COMMENT '建议售价币种',
  suggest_price          decimal(14, 4) COMMENT '建议售价，商业字段：无权限时接口置 NULL',
  spu_code               varchar(64)   COMMENT '所属 SPU 编码，关联 pd_spu 的唯一键',
  spu_name               varchar(512)  COMMENT '冗余的 SPU 名称，省一次 join',
  spu_model_name         varchar(255)  COMMENT '冗余的型号名，可为 spu_model_name 的空值兜底',
  spec_product_length    decimal(12, 4) COMMENT '单品长，单位厘米（单位由展示层拼接）',
  spec_product_width     decimal(12, 4) COMMENT '单品宽，单位厘米',
  spec_product_height    decimal(12, 4) COMMENT '单品高，单位厘米',
  spec_product_weight    decimal(12, 4) COMMENT '单品毛重，单位千克',
  spec_product_net_weight decimal(12, 4) COMMENT '单品净重，单位千克',
  spec_carton_length     decimal(12, 4) COMMENT '箱规长，单位厘米',
  spec_carton_width      decimal(12, 4) COMMENT '箱规宽，单位厘米',
  spec_carton_height     decimal(12, 4) COMMENT '箱规高，单位厘米',
  spec_carton_weight     decimal(12, 4) COMMENT '箱规重量，单位千克',
  spec_carton_num        int           COMMENT '装箱数（每箱几个单品）',
  spec_material          varchar(512)  COMMENT '材质',
  sku_color              varchar(128)  COMMENT '颜色',
  sku_size               varchar(128)  COMMENT '尺寸',
  sku_pack               varchar(255)  COMMENT '包装规格',
  listing_time           datetime      COMMENT 'SKU 上架时间',
  attr_info              json          COMMENT '属性原始 JSON，原样透传',
  sensitive_info         json          COMMENT '敏感信息 JSON，仅后端持有，不向外输出',
  deleted                int           COMMENT '源端删除标记，0/1',
  update_time            datetime      COMMENT '源表更新时间；SR 侧去重排序依据（取最新一条）'
) DUPLICATE KEY(sku_code, ds)
COMMENT '商品中心 360 - SKU 主档（→ PG pd_sku）。一 SKU 一行，规格列单位在展示层拼接';

-- ---------------------------------------------------------------------------
-- 3. sal_sku_code（渠道外部编码：ASIN / 平台 SKU）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS p360_sal_sku_code (
  channel                varchar(64)   NOT NULL COMMENT '渠道英文标识（amazon/shopify/tiktok…），粒度第一维',
  site                   varchar(64)   NOT NULL COMMENT '站点国家码（US/DE/UK…）；注意源端 UK 与 GB 并存，不归一',
  shop_code              varchar(128)  NOT NULL COMMENT '店铺编码，粒度第三维',
  sale_sku_code          varchar(128)  NOT NULL COMMENT '平台侧 SKU（ASIN 或店铺自定义码），即页面「平台 SKU」',
  sku_code               varchar(64)   NOT NULL COMMENT '映射到的内部 SKU 编码；为 NULL 的行说明映射缺失',
  ds                     date          NOT NULL COMMENT '源表 ds 分区日',
  channel_name           varchar(128)  COMMENT '渠道中文名（亚马逊/Tiktok平台…），页面展示用',
  shop_name              varchar(255)  COMMENT '店铺名称',
  asin                   varchar(64)   COMMENT '亚马逊 ASIN，非亚马逊渠道为空',
  parent_asin            varchar(64)   COMMENT '父 ASIN（变体组）',
  asin_url               string        COMMENT 'ASIN 页面链接',
  scm_sku_code           varchar(64)   COMMENT '供应链 SKU 编码',
  spu_code               varchar(64)   COMMENT '映射到的 SPU 编码',
  listing_status         varchar(64)   COMMENT '上架状态原值；注意存在脏值 \'11\'（实测 22 行），新表已改读 sal_sku_online_listing',
  sal_listing_time       datetime      COMMENT '渠道上架时间',
  first_order_time       datetime      COMMENT '该编码首单时间',
  suggest_currency       varchar(16)   COMMENT '建议售价币种',
  suggest_price          decimal(14, 4) COMMENT '建议售价，商业字段：无权限时接口置 NULL',
  sale_sku_qty           int           COMMENT '该编码的销售数量汇总',
  sal_image_url          string        COMMENT '渠道侧商品图 URL',
  category_name_level1   varchar(255)  COMMENT '渠道侧一级类目名（源端口径，与 pd_spu 类目不同源）',
  listing_operator       varchar(255)  COMMENT '渠道上架操作人姓名'
) DUPLICATE KEY(channel, site, shop_code, sale_sku_code, sku_code)
COMMENT '商品中心 360 - 渠道外部编码（→ PG sal_sku_code）。一 (渠道,站点,店铺,平台SKU,内部SKU) 一行；页面「渠道销售贡献」卡的数据源，与上架矩阵是两个源，渠道数会不同';

-- ---------------------------------------------------------------------------
-- 4. sal_sku_online_listing（全渠道在线商品，listing 级快照）
-- ---------------------------------------------------------------------------
-- 当前覆盖 11 个渠道值（amazon / shopify / shopee / lazada / mercadolibre /
-- mercadolibre_local / shein / aliexpress / aliexpress_pop_choice / cdiscount /
-- shoplazza），源表 src_table 为 dwb_sal_sku_amazon_df / dwb_sal_sku_jijia_listing_df /
-- dwb_sal_sku_shopify_df 三张。listing_status 已归一为 online/offline/deleted/draft，
-- listing_status_raw 保留源端原值（「下架|正常」「AVAILABLE_FOR_SALE」「active」「draft」等）。
-- 去重键含 external_id：同一内部 SKU 在 Shopify 会被重复建成多个商品，只按
-- channel|site|shop_code|msku 去重会丢行。
CREATE TABLE IF NOT EXISTS p360_sal_sku_online_listing (
  channel                varchar(64)   NOT NULL COMMENT '渠道英文标识，粒度第一维（本地抽样 11 个值，生产会更多）',
  site                   varchar(64)   COMMENT '站点国家码；可为空，故不能进 PRIMARY KEY',
  shop_code              varchar(128)  COMMENT '店铺编码；可为空',
  msku                   varchar(255)  NOT NULL COMMENT '平台侧商家 SKU（merchant SKU），listing 粒度键',
  ds                     date          NOT NULL COMMENT '源表 ds 分区日',
  external_id            varchar(128)  COMMENT '平台侧商品唯一 id（Shopify product id / ASIN 等）；去重键第 5 列，缺了会丢 16.5% 的行',
  external_id_type       varchar(32)   COMMENT 'external_id 的类型标识，说明上列是哪种 id',
  parent_external_id     varchar(128)  COMMENT '父级商品 id（变体组/父 ASIN），可变体归组用',
  sku_code               varchar(64)   COMMENT '映射到的内部 SKU 编码；为空说明该 listing 缺内部映射',
  scm_sku_code           varchar(64)   COMMENT '供应链 SKU 编码',
  spu_code               varchar(64)   COMMENT '映射到的 SPU 编码；本地抽样中与 sku_code 同空同非空，为空的行落不到任何商品页',
  title                  string        COMMENT 'listing 标题',
  description_summary    string        COMMENT '描述摘要（源端已截断），明细展开行展示',
  main_image_url         string        COMMENT 'listing 主图 URL',
  listing_status         varchar(32)   COMMENT '已归一的上架状态：online/offline/draft/deleted 四值（替换了旧表的脏值 11）',
  listing_status_raw     varchar(64)   COMMENT '源端原始状态（下架|正常 / AVAILABLE_FOR_SALE / active / draft…），作 Tooltip 解释归一来源',
  operator_name          varchar(255)  COMMENT '渠道侧运营负责人姓名',
  currency_code          varchar(16)   COMMENT '币种（本地抽样 14 种），跨渠道不可直接比价',
  list_price             decimal(14, 4) COMMENT '标价，商业字段：无权限时接口置 NULL',
  sale_price             decimal(14, 4) COMMENT '售价，商业字段：无权限时接口置 NULL',
  barcode                varchar(128)  COMMENT '条码（UPC/EAN 等）',
  inventory_qty          int           COMMENT '渠道侧库存数量（源端口径，非「可售」细分）',
  rating                 decimal(3, 2) COMMENT 'listing 自身星级 0-5，不是评论聚合值（评论聚合看 voc_review_day）',
  content_item_cnt       int           COMMENT '内容完整项数 1-5，等于后 5 个 has_* 之和（本地 2000 行 100% 自洽），源端算好原样透传',
  has_title              int           COMMENT '0/1：有无标题。是 int 不是 boolean，判定用 = 0',
  has_main_image         int           COMMENT '0/1：有无主图',
  has_description        int           COMMENT '0/1：有无描述；online 行里缺描述最多，是质量告警的主要命中项',
  has_price              int           COMMENT '0/1：有售价，语义等价于 sale_price > 0',
  has_status             int           COMMENT '0/1：有上架状态',
  product_link           string        COMMENT '平台商品页链接',
  src_table              varchar(128)  COMMENT '上游源表名，三张之一：dwb_sal_sku_amazon_df / dwb_sal_sku_jijia_listing_df / dwb_sal_sku_shopify_df'
) DUPLICATE KEY(channel, site, shop_code, msku, external_id)
COMMENT '商品中心 360 - 全渠道在线商品宽表（→ PG sal_sku_online_listing）。listing 级快照，一平台上架项一行；去重键必须含 external_id'

-- ---------------------------------------------------------------------------
-- 5. sal_sku_day（销售日汇总）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS p360_sal_sku_day (
  order_date             date          NOT NULL COMMENT '订单日期，粒度第一维（按天）',
  platform               varchar(64)   NOT NULL COMMENT '平台中文名（亚马逊/Tiktok平台…），与 channel 不同源：它是中文展示名',
  shop                   varchar(128)  NOT NULL COMMENT '店铺编码，粒度第三维（本地抽样 67 个）',
  country_code           varchar(16)   NOT NULL COMMENT '站点国家码（本地抽样 23 个）',
  platform_sku           varchar(128)  NOT NULL COMMENT '平台侧 SKU 编码，粒度第五维',
  ds                     date          NOT NULL COMMENT '源表 ds 分区日',
  channel                varchar(64)   COMMENT '渠道英文标识（amazon/tiktok…）；与 platform 是「英文键 vs 中文名」的关系，不能混用',
  country_name           varchar(128)  COMMENT '站点国家名',
  asin                   varchar(64)   COMMENT '亚马逊 ASIN',
  parent_asin            varchar(64)   COMMENT '父 ASIN',
  sku_code               varchar(64)   COMMENT '映射到的内部 SKU 编码',
  spu_code               varchar(64)   COMMENT '映射到的 SPU 编码；质量告警「有销量但非在售」用它关联主档',
  spu_name               varchar(512)  COMMENT '冗余 SPU 名',
  sku_name               varchar(512)  COMMENT '冗余 SKU 名',
  brand_code             varchar(64)   COMMENT '品牌编码',
  category_name_level1   varchar(255)  COMMENT '一级类目名（销售表口径）',
  order_qty              int           COMMENT '订单件数（含未付款/已取消），不等于销量',
  sale_qty               int           COMMENT '销售件数（页面的「销量」口径）；为 0 时不要当空值处理',
  sales_amount           decimal(16, 4) COMMENT '销售额（原币），商业字段；全为 NULL 时保持 NULL，不填 0',
  sales_amount_usd       decimal(16, 4) COMMENT '销售额（USD），商业字段；全为 NULL 时保持 NULL，不填 0',
  after_sale_replacement_qty int       COMMENT '售后换货数量，页面叫 return_qty（列名与字段名不一致，集成任务按列名映射别手抄）'
) DUPLICATE KEY(order_date, platform, shop, country_code, platform_sku)
COMMENT '商品中心 360 - 销售日汇总（→ PG sal_sku_day）。一天一平台一店铺一站点一平台SKU 一行；order_qty ≠ sale_qty';

-- ---------------------------------------------------------------------------
-- 6. scm_stock（渠道库存）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS p360_scm_stock (
  channel_code           varchar(64)   NOT NULL COMMENT '渠道编码，粒度第一维',
  country_code           varchar(16)   NOT NULL COMMENT '国家/站点码，粒度第二维',
  sku_code               varchar(64)   NOT NULL COMMENT '内部 SKU 编码，粒度第三维',
  warehouse_code         varchar(64)   NOT NULL COMMENT '仓库编码，粒度第四维；源端可为空，故用 DUPLICATE KEY',
  ds                     date          NOT NULL COMMENT '源表 ds 分区日',
  warehouse_name         varchar(255)  COMMENT '仓库名称',
  in_stock_qty           int           COMMENT '在库数量，汇总到 pd_spu.in_stock_qty',
  on_way_qty             int           COMMENT '在途数量，汇总到 pd_spu.on_way_qty'
) DUPLICATE KEY(channel_code, country_code, sku_code, warehouse_code)
COMMENT '商品中心 360 - 渠道库存（→ PG scm_stock）。按 渠道/国家/SKU/仓库 一行；只用于汇总在库与在途，页面不直接展示明细';

-- ---------------------------------------------------------------------------
-- 7. voc_review_day（自有评论日汇总）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS p360_voc_review_day (
  spu_code               varchar(64)   NOT NULL COMMENT 'SPU 编码，粒度第一维',
  review_date            date          NOT NULL COMMENT '评论日期，粒度第二维',
  ds                     date          NOT NULL COMMENT '源表 ds 分区日',
  rating_avg             decimal(4, 3) COMMENT '当日星级均值 0-5',
  review_count           int           COMMENT '当日评论数；汇总后写入 pd_spu.review_count',
  source                 varchar(128)  COMMENT '上游源表名，用于溯源'
) DUPLICATE KEY(spu_code, review_date)
COMMENT '商品中心 360 - 评论日汇总（→ PG voc_review_day）。只含自有品牌（is_own_brand=1），竞品在 voc_competitor';

-- ---------------------------------------------------------------------------
-- 8. voc_nps_sentiment（NPS 五档情绪分布）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS p360_voc_nps_sentiment (
  spu_code               varchar(64)   NOT NULL COMMENT 'SPU 编码，粒度第一维',
  sentiment              varchar(64)   NOT NULL COMMENT '情绪档名称（与 bucket 一一对应）',
  ds                     date          NOT NULL COMMENT '源表 ds 分区日',
  bucket                 int           COMMENT '情绪档序 0 差 … 4 好，页面按它排序（不按 sentiment 字符串排序）',
  item_count             int           COMMENT '该档的提及数',
  ratio                  decimal(6, 4) COMMENT '该档占比 0-1 小数，不是百分数；各档 ratio 之和不一定等于 1（源端口径）',
  source                 varchar(128)  COMMENT '上游源表名，用于溯源'
) DUPLICATE KEY(spu_code, sentiment)
COMMENT '商品中心 360 - NPS 情绪分布（→ PG voc_nps_sentiment）。一 SPU 五档情绪各一行；排序用 bucket 不用 sentiment';

-- ---------------------------------------------------------------------------
-- 9. voc_nps_tag（体验因子；nps_tag_list 数组展开后一行一个因子）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS p360_voc_nps_tag (
  spu_code               varchar(64)   NOT NULL COMMENT 'SPU 编码，粒度第一维',
  tag_name               varchar(255)  NOT NULL COMMENT '体验因子名称（由 nps_tag_list 数组展开而来，一行一个因子）',
  sentiment              varchar(64)   NOT NULL COMMENT '所属情绪档，粒度第三维',
  ds                     date          NOT NULL COMMENT '源表 ds 分区日',
  tag_count              int           COMMENT '该因子在该档下的提及数',
  ratio                  decimal(6, 4) COMMENT '该因子占比 0-1 小数',
  source                 varchar(128)  COMMENT '上游源表名，用于溯源'
) DUPLICATE KEY(spu_code, tag_name, sentiment)
COMMENT '商品中心 360 - 体验因子（→ PG voc_nps_tag）。源端 nps_tag_list 是 JSON 数组，已展平成一行一个因子';

-- ---------------------------------------------------------------------------
-- 10. voc_ticket_topic（工单主题）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS p360_voc_ticket_topic (
  spu_code               varchar(64)   NOT NULL COMMENT 'SPU 编码，粒度第一维',
  topic                  varchar(255)  NOT NULL COMMENT '工单主题名，粒度第二维',
  ds                     date          NOT NULL COMMENT '源表 ds 分区日',
  voc_type               varchar(64)   COMMENT '工单 VOC 类型（分类维度）',
  ticket_count           int           COMMENT '该主题的工单数',
  ratio                  decimal(6, 4) COMMENT '该主题占比 0-1 小数',
  source                 varchar(128)  COMMENT '上游源表名，用于溯源'
) DUPLICATE KEY(spu_code, topic)
COMMENT '商品中心 360 - 工单主题（→ PG voc_ticket_topic）。一 SPU 一主题一行；voc_type 是附加分类维度，不在键里';

-- ---------------------------------------------------------------------------
-- 11. voc_competitor（竞品口碑）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS p360_voc_competitor (
  brand_name             varchar(255)  NOT NULL COMMENT '竞品品牌名，粒度第一维',
  voc_model              varchar(255)  NOT NULL COMMENT '竞品型号，粒度第二维',
  ds                     date          NOT NULL COMMENT '源表 ds 分区日',
  spu_code               varchar(64)   COMMENT '恒为 NULL：竞品行没有内部 SPU。保留列只为与 PG 列对齐，别用它对竞品做 SPU 关联',
  rating_avg             decimal(4, 3) COMMENT '竞品星级均值 0-5',
  review_count           int           COMMENT '竞品评论数',
  source                 varchar(128)  COMMENT '上游源表名，用于溯源'
) DUPLICATE KEY(brand_name, voc_model)
COMMENT '商品中心 360 - 竞品口碑（→ PG voc_competitor）。竞品口径 is_own_brand <> 1，与自有评论完全分开';

-- ---------------------------------------------------------------------------
-- 12. sync_batch（同步批次；页面 asOf / delayed 的唯一来源，不能漏）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS p360_sync_batch (
  batch_id               varchar(64)   NOT NULL COMMENT '批次 id，一次同步任务一个',
  source_table           varchar(128)  NOT NULL COMMENT '本次同步写的是哪张表（写 PG 表名，不是 SR 表名）',
  source_ds              date          COMMENT '本批次数据的源分区日，页面的 asOf 就去这里取',
  row_count              int           COMMENT '本批次写入行数，验收时用它对账',
  status                 varchar(16)   COMMENT 'success / failed；页面 delayed 判定只看 success 的 finished_at',
  message                varchar(1024) COMMENT '失败原因或备注，排障看这里',
  started_at             datetime      COMMENT '任务开始时间',
  finished_at            datetime      COMMENT '任务结束时间；超过 48h 未更新则页面标 delayed（THRESHOLD可调）'
) DUPLICATE KEY(batch_id, source_table)
COMMENT '商品中心 360 - 同步批次（→ PG sync_batch）。页面 asOf / delayed 的唯一来源，必须最后跑，漏跑则全区显示延迟';
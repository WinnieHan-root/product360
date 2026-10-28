-- ============================================================================
-- 商品多模态数仓数据盘点 - 8张候选表建表语句(DDL)
-- 项目: lute_edw (StarRocks OLAP)
-- 整理时间: 2026-10-27
-- 来源: https://momcozy-in.feishu.cn/wiki/Sybxw5h1PivZfjkZvrgcJcc1nHK?sheet=1qAckS
-- 说明:
--   - 表1/表2字段来自《产研域数据模型》wiki完整字段表(字段完整确认)
--   - 表3~表7字段来自盘点sheet关键字段摘要,完整字段需从RootData/
--     dim_dataphin_node.node_content 取(已用 TODO 标注待补字段)
--   - 表8 NPS表字段来自《NPS需求技术方案》,字段相对完整
--   - 建表规范: ENGINE=OLAP, DUPLICATE KEY, PARTITION BY(ds),
--     DISTRIBUTED BY HASH(业务主键), replication_num=3, compression=lz4
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 表1: dim_pd_spu_info_df  商品SPU主数据表
--   分层:DIM | 粒度:SPU日快照 | 优先级:P0
--   最新日期:2026-10-26 | 最新分区行数:1,124 | 关键对象数:1,124
--   可用性:可直接使用 | 建议用途:商品事实与标准内容底座
--   主要问题:品牌缺失3条;SPU主键完整
--   分区字段: ds DATE (按天分区,格式yyyy-MM-dd)
--   主键:(ds, company_code, spu_code)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lute_edw.dim_pd_spu_info_df (
    ds                          DATE            COMMENT '日期分区字段,格式yyyy-MM-dd,按天分区,每日快照/增量',
    company_code                VARCHAR(32)     COMMENT '企业编码,如C00000001',
    spu_code                    VARCHAR(64)     COMMENT 'SPU编码,业务主键,如SPU000072',
    spu_name                    VARCHAR(255)    COMMENT '商品中文名称',
    spu_name_en                 VARCHAR(255)    COMMENT '商品英文名称',
    spu_alias_name              VARCHAR(255)    COMMENT '商品别名',
    spu_image                   VARCHAR(65533)  COMMENT 'SPU主图URL',
    spu_desc                    VARCHAR(65533)  COMMENT 'SPU商品描述',
    spu_level                   VARCHAR(32)     COMMENT '产品等级(旧)',
    spu_level_new               VARCHAR(32)     COMMENT '商品等级(新),如A/B/C',
    spu_state                   INT             COMMENT 'SPU状态:0-开发中,1-待上架,2-可销售,3-已下架,5-已取消',
    spu_state_desc              VARCHAR(32)     COMMENT 'SPU状态描述',
    approve_status              INT             COMMENT '审批状态:0-未审批,1-审批中,2-审批通过,3-审批拒绝',
    approve_status_desc          VARCHAR(32)     COMMENT '审批状态描述',
    purchase_approve_status     INT             COMMENT '采购审批状态',
    purchase_workflow_code      VARCHAR(32)     COMMENT '采购审批工单编码',
    declare_approve_status      INT             COMMENT '申报审批状态',
    declare_workflow_code       VARCHAR(32)     COMMENT '申报审批工单号',
    suggest_currency            VARCHAR(32)     COMMENT '建议销售价格币种,如USD',
    suggest_price               DECIMAL(10,4)   COMMENT '建议销售价格',
    spu_product_type            INT             COMMENT '商品类型:1-产品,2-配件,3-用研产品,13-组合产品,14-虚拟产品',
    spu_product_type_desc       VARCHAR(32)     COMMENT '商品类型描述',
    spu_type                    BIGINT          COMMENT 'SPU类型:0-库存商品,1-物流服务商品,2-虚拟商品',
    spu_type_desc               VARCHAR(32)     COMMENT 'SPU类型描述',
    spu_model_code              VARCHAR(255)    COMMENT '型号编码',
    spu_model_name              VARCHAR(100)    COMMENT '型号名称',
    brand_code                  VARCHAR(32)     COMMENT '品牌编码',
    product_line_code           VARCHAR(64)     COMMENT '产品线编码',
    product_line_name           VARCHAR(255)    COMMENT '产品线名称',
    product_leader_code         VARCHAR(64)     COMMENT '产品负责人编码',
    product_leader_name         VARCHAR(255)    COMMENT '产品负责人姓名',
    gtm_code                    VARCHAR(64)     COMMENT 'GTM品线编码',
    gtm_name                    VARCHAR(255)    COMMENT 'GTM品线名称',
    gtm_leader_code             VARCHAR(64)     COMMENT 'GTM负责人编码',
    gtm_leader_name             VARCHAR(255)    COMMENT 'GTM负责人姓名',
    gtm_member_code             VARCHAR(4096)   COMMENT 'GTM经理编码(多值)',
    gtm_member_name             VARCHAR(4096)   COMMENT 'GTM经理姓名(多值)',
    planner_code                VARCHAR(255)    COMMENT '计划专员编码',
    planner_name                VARCHAR(255)    COMMENT '计划专员姓名',
    category_code               VARCHAR(32)     COMMENT 'SPU挂载类目编码',
    category_name               VARCHAR(256)    COMMENT '类目名称',
    category_code_level1        VARCHAR(256)    COMMENT '一级类目编码',
    category_name_level1        VARCHAR(256)    COMMENT '一级类目名称',
    category_code_level2        VARCHAR(256)    COMMENT '二级类目编码',
    category_name_level2        VARCHAR(256)    COMMENT '二级类目名称',
    category_code_level3        VARCHAR(256)    COMMENT '三级类目编码',
    category_name_level3        VARCHAR(256)    COMMENT '三级类目名称',
    category_code_level4        VARCHAR(256)    COMMENT '四级类目编码',
    category_name_level4        VARCHAR(256)    COMMENT '四级类目名称',
    category_code_level5        VARCHAR(256)    COMMENT '五级类目编码',
    category_name_level5        VARCHAR(256)    COMMENT '五级类目名称',
    selling_point               VARCHAR(255)    COMMENT 'SPU卖点',
    voc_model                   VARCHAR(100)    COMMENT 'VOC型号,如BS02',
    sence_tag_name              VARCHAR(256)    COMMENT '场景标签,从tag_info提取',
    fmcg_tag_name               VARCHAR(256)    COMMENT '快消品标识,从tag_info提取',
    iot_tag_name                VARCHAR(256)    COMMENT 'IoT标识,从tag_info提取',
    tag_info                    JSON            COMMENT '多标签JSON数组,元素含tag_code/tag_name/tag_type',
    series_info                 JSON            COMMENT '多系列JSON数组',
    model_info                  JSON            COMMENT '多型号JSON数组',
    listing_time                DATE            COMMENT '上架时间',
    is_active                   BIGINT          COMMENT '是否有效:1-有效,0-无效',
    deleted                     BIGINT          COMMENT '删除状态:0-未删除',
    operator_code               VARCHAR(32)     COMMENT '操作人编码',
    operator_name               VARCHAR(32)     COMMENT '操作人姓名',
    create_by                   VARCHAR(32)     COMMENT '创建人',
    write_by                    VARCHAR(32)     COMMENT '更新者',
    delete_at                    DATETIME        COMMENT '删除时间',
    delete_by                   VARCHAR(32)     COMMENT '删除者',
    extra_info                  VARCHAR(65533)  COMMENT '扩展信息JSON原文',
    approve_info                VARCHAR(65533)  COMMENT '审批备份信息',
    create_time                 DATETIME        COMMENT '记录创建时间',
    update_time                 DATETIME        COMMENT '记录更新时间',
    pt                          DATETIME        COMMENT '数据处理时间,DEFAULT CURRENT_TIMESTAMP'
)
ENGINE = OLAP
DUPLICATE KEY (`ds`, `company_code`, `spu_code`)
COMMENT 'DIM-产研域-SPU明细维度表,每日全量快照,粒度一行一个SPU'
PARTITION BY (`ds`)
DISTRIBUTED BY HASH(`spu_code`)
PROPERTIES (
    "replication_num" = "3",
    "compression" = "lz4"
);


-- ----------------------------------------------------------------------------
-- 表2: dim_pd_sku_info_df  商品SKU信息维表
--   分层:DIM | 粒度:SKU日快照 | 优先级:P0
--   最新日期:2026-10-26 | 最新分区行数:11,553 | 关键对象数:11,553
--   可用性:可直接使用 | 建议用途:SKU变体与SPU关系
--   主要问题:59条缺SPU;4,001条缺主图
--   分区字段: ds DATE (按天分区,格式yyyy-MM-dd)
--   主键:(ds, company_code, sku_code)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lute_edw.dim_pd_sku_info_df (
    ds                          DATE            COMMENT '日期分区字段,格式yyyy-MM-dd,按天分区,每日快照/增量',
    company_code                VARCHAR(32)     COMMENT '企业编码',
    sku_code                    VARCHAR(64)     COMMENT 'SKU编码,业务主键,如AB001-A573NB',
    sku_code_new                VARCHAR(64)     COMMENT '新产品编码',
    scm_sku_code                VARCHAR(255)    COMMENT '供应链商品SKU编码',
    sku_name                    VARCHAR(255)    COMMENT '商品中文名称',
    sku_name_en                 VARCHAR(255)    COMMENT '商品英文名称',
    sku_image_url               VARCHAR(1024)   COMMENT '商品主图URL',
    sku_images                  VARCHAR(2000)   COMMENT '商品图片列表字符串(逗号分隔)',
    sku_state                   INT             COMMENT 'SKU状态:1-未上架,2-在销售,3-清仓中,4-已退市,0-已取消',
    sku_state_desc              VARCHAR(32)     COMMENT 'SKU状态描述',
    brand_code                  VARCHAR(255)    COMMENT '品牌编码',
    brand_name                  VARCHAR(255)    COMMENT '品牌名称,如Momcozy',
    suggest_currency            VARCHAR(32)     COMMENT '建议销售币种',
    suggest_price               DECIMAL(10,4)   COMMENT '建议销售价格',
    developer_code              VARCHAR(255)    COMMENT '产品经理编码',
    developer_name              VARCHAR(255)    COMMENT '产品经理名称',
    developer_dept              VARCHAR(255)    COMMENT '产品经理部门',
    listing_time                DATETIME        COMMENT '上架时间',
    remark                      VARCHAR(1024)   COMMENT '备注',
    is_active                   INT             COMMENT '是否有效:1-有效,2-失效',
    deleted                     BIGINT          COMMENT '删除状态:0-未删除',
    create_time                 DATETIME        COMMENT 'SKU创建时间',
    update_time                 DATETIME        COMMENT 'SKU更新时间',
    spu_code                    VARCHAR(255)    COMMENT '所属SPU编码,关联dim_pd_spu_info_df.spu_code',
    spu_name                    VARCHAR(255)    COMMENT '所属SPU名称',
    spu_level                   VARCHAR(32)     COMMENT 'SPU产品等级',
    spu_level_new               VARCHAR(32)     COMMENT 'SPU商品等级',
    spu_state                   INT             COMMENT 'SPU状态:0-开发中,1-待上架,2-可销售,3-已下架,5-已取消',
    spu_state_desc              VARCHAR(32)     COMMENT 'SPU状态描述',
    spu_product_type            INT             COMMENT 'SPU商品类型:1-产品,2-配件,13-组合,14-虚拟',
    spu_product_type_desc       VARCHAR(32)     COMMENT 'SPU商品类型描述',
    spu_type                    BIGINT          COMMENT 'SPU类型:0-库存,1-物流服务,2-虚拟',
    spu_type_desc               VARCHAR(32)     COMMENT 'SPU类型描述',
    spu_model_code              VARCHAR(255)    COMMENT 'SPU型号编码',
    spu_model_name              VARCHAR(100)    COMMENT 'SPU型号名称',
    product_line_code           VARCHAR(64)     COMMENT '产品线编码',
    product_line_name           VARCHAR(255)    COMMENT '产品线名称',
    product_leader_code         VARCHAR(64)     COMMENT '产品负责人编码',
    product_leader_name         VARCHAR(255)    COMMENT '产品负责人姓名',
    gtm_code                    VARCHAR(64)     COMMENT 'GTM品线编码',
    gtm_name                    VARCHAR(255)    COMMENT 'GTM品线名称',
    gtm_leader_code              VARCHAR(64)     COMMENT 'GTM负责人编码',
    gtm_leader_name             VARCHAR(255)    COMMENT 'GTM负责人姓名',
    gtm_member_code             VARCHAR(4096)   COMMENT 'GTM经理编码(多值)',
    gtm_member_name             VARCHAR(4096)   COMMENT 'GTM经理姓名(多值)',
    planner_code                VARCHAR(255)    COMMENT '计划专员编码',
    planner_name                VARCHAR(255)    COMMENT '计划专员姓名',
    pt                          DATETIME        COMMENT '数据处理时间,DEFAULT CURRENT_TIMESTAMP'
)
ENGINE = OLAP
DUPLICATE KEY (`ds`, `company_code`, `sku_code`)
COMMENT 'DIM-产研域-SKU明细维度表,每日全量快照,粒度一行一个SKU,冗余SPU属性'
PARTITION BY (`ds`)
DISTRIBUTED BY HASH(`sku_code`)
PROPERTIES (
    "replication_num" = "3",
    "compression" = "lz4"
);


-- ----------------------------------------------------------------------------
-- 表3: dws_sal_sku_statistics_td_df  全渠道销售订单明细(商品销量汇总表)
--   分层:DWS | 粒度:渠道-站点-店铺-商品日聚合 | 优先级:P0
--   最新日期:2026-10-26 | 最新分区行数:3,852 | 关键对象数:3,093
--   可用性:可直接使用 | 建议用途:GMV、销量与渠道贡献
--   主要问题:最近日期覆盖4个平台;平台SKU无缺失
--   分区字段: ds DATE (按天分区,格式yyyy-MM-dd)
--   主键:(ds, platform, shop_code, platform_sku)
--   注意:以下字段为盘点sheet中确认的关键字段,完整字段列表需从RootData补充
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lute_edw.dws_sal_sku_statistics_td_df (
    ds                          DATE            COMMENT '日期分区字段,格式yyyy-MM-dd,按天分区,每日快照/增量',
    platform                    VARCHAR(64)     COMMENT '平台,如Amazon/TikTok/Shopify',
    channel                     VARCHAR(64)     COMMENT '渠道编码',
    site                        VARCHAR(32)     COMMENT '站点,如US/CA/UK/DE',
    shop_code                   VARCHAR(64)     COMMENT '店铺编码',
    shop_name                   VARCHAR(255)    COMMENT '店铺名称',
    asin                        VARCHAR(32)     COMMENT '亚马逊ASIN',
    platform_sku                VARCHAR(128)    COMMENT '平台SKU(卖家SKU)',
    sku_code                    VARCHAR(64)     COMMENT '内部SKU编码,关联dim_pd_sku_info_df',
    spu_code                    VARCHAR(64)     COMMENT '内部SPU编码,关联dim_pd_spu_info_df',
    sales_qty                   BIGINT          COMMENT '销量(件)',
    sales_amount                DECIMAL(18,4)   COMMENT '销售额(本币)',
    sales_amount_usd            DECIMAL(18,4)   COMMENT '销售额(美元)',
    order_count                 BIGINT          COMMENT '订单数',
    -- TODO: 需从RootData补充:退款/广告成本/毛利等指标字段
    pt                          DATETIME        COMMENT '数据处理时间'
)
ENGINE = OLAP
DUPLICATE KEY (`ds`, `platform`, `shop_code`, `platform_sku`)
COMMENT 'DWS-销售域-全渠道商品日销售汇总,粒度渠道-站点-店铺-SKU-日'
PARTITION BY (`ds`)
DISTRIBUTED BY HASH(`sku_code`)
PROPERTIES (
    "replication_num" = "3",
    "compression" = "lz4"
);


-- ----------------------------------------------------------------------------
-- 表4: dwb_scm_stock_channel_df  供应链渠道库存快照表
--   分层:DWB | 粒度:渠道-国家-仓库-SKU日快照 | 优先级:P0
--   最新日期:2026-10-26 | 最新分区行数:85,460 | 关键对象数:6,501
--   可用性:可直接使用 | 建议用途:库存、在途与缺货风险
--   主要问题:覆盖17个渠道;28条缺SKU
--   分区字段: ds DATE (按天分区,格式yyyy-MM-dd)
--   主键:(ds, channel_code, country_code, warehouse_code, sku_code)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lute_edw.dwb_scm_stock_channel_df (
    ds                          DATE            COMMENT '日期分区字段,格式yyyy-MM-dd,按天分区,每日快照/增量',
    channel_code                VARCHAR(64)     COMMENT '渠道编码',
    country_code                VARCHAR(32)     COMMENT '国家编码',
    warehouse_code              VARCHAR(64)     COMMENT '仓库编码',
    warehouse_name              VARCHAR(255)    COMMENT '仓库名称',
    sku_code                    VARCHAR(64)     COMMENT '内部SKU编码',
    spu_code                    VARCHAR(64)     COMMENT '内部SPU编码',
    in_stock_qty                DECIMAL(18,4)   COMMENT '在库库存数量',
    on_way_qty                  DECIMAL(18,4)   COMMENT '在途库存数量',
    -- TODO: 需补充:可售库存/预留库存/库存金额/库龄等字段
    pt                          DATETIME        COMMENT '数据处理时间'
)
ENGINE = OLAP
DUPLICATE KEY (`ds`, `channel_code`, `country_code`, `warehouse_code`, `sku_code`)
COMMENT 'DWB-供应链-渠道国家仓库SKU日库存快照'
PARTITION BY (`ds`)
DISTRIBUTED BY HASH(`sku_code`)
PROPERTIES (
    "replication_num" = "3",
    "compression" = "lz4"
);


-- ----------------------------------------------------------------------------
-- 表5: dim_sal_sku_info_df  平台商品SKU维表(销售渠道商品明细)
--   分层:DIM | 粒度:平台SKU | 优先级:P0
--   可用性:需替换 | 建议用途:外部编码与内部SKU映射
--   主要问题:表名含temp和日期,不建议作为生产依赖
--   分区字段: ds DATE (按天分区,格式yyyy-MM-dd)
--   主键:(ds, channel, site, shop_code, sale_sku_code, asin, scm_sku_code, sal_sku_type)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lute_edw.dim_sal_sku_info_df (
    ds                          DATE            COMMENT '日期分区字段,格式yyyy-MM-dd,按天分区,每日快照/增量',
    platform                    VARCHAR(64)     COMMENT '平台',
    channel                     VARCHAR(64)     COMMENT '渠道编码',
    site                        VARCHAR(32)     COMMENT '站点',
    shop_code                   VARCHAR(64)     COMMENT '店铺编码',
    asin                        VARCHAR(32)     COMMENT '亚马逊ASIN',
    upc                         VARCHAR(32)     COMMENT 'UPC编码',
    gtin                        VARCHAR(32)     COMMENT 'GTIN编码',
    item_id                     VARCHAR(64)     COMMENT '平台商品ID',
    platform_sku               VARCHAR(128)    COMMENT '平台SKU(卖家SKU)',
    scm_sku_code                VARCHAR(64)     COMMENT '供应链SKU编码',
    sku_code                    VARCHAR(64)     COMMENT '内部SKU编码,关联dim_pd_sku_info_df',
    spu_code                    VARCHAR(64)     COMMENT '内部SPU编码',
    sal_sku_type                VARCHAR(32)     COMMENT '销售SKU类型',
    pt                          DATETIME        COMMENT '数据处理时间'
)
ENGINE = OLAP
DUPLICATE KEY (`ds`, `channel`, `site`, `shop_code`, `platform_sku`, `asin`)
COMMENT 'DIM-销售域-平台商品SKU映射维表,外部编码(ASIN/UPC/GTIN)与内部SKU/SPU映射'
PARTITION BY (`ds`)
DISTRIBUTED BY HASH(`sku_code`)
PROPERTIES (
    "replication_num" = "3",
    "compression" = "lz4"
);


-- ----------------------------------------------------------------------------
-- 表6: dwb_cs_voc_record_channel_hf  商品评论明细表
--   分层:DWB | 粒度:voc_id | 优先级:P0 | 主题:VOC/社媒
--   最新日期:2026-10-26 | 最新分区行数:144,116 | 关键对象数:144,116
--   可用性:部分可用 | 建议用途:Amazon差评与VOC分析
--   主要问题:情绪仅缺60条;images字段本批次全部为空
--   分区字段: ds DATE (按天分区,格式yyyy-MM-dd)
--   主键:(ds, voc_id)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lute_edw.dwb_cs_voc_record_channel_hf (
    ds                          DATE            COMMENT '日期分区字段,格式yyyy-MM-dd,按天分区,每日快照/增量',
    voc_id                      VARCHAR(64)     COMMENT 'VOC记录ID,业务主键',
    platform                    VARCHAR(64)     COMMENT '平台,如Amazon',
    channel                     VARCHAR(64)     COMMENT '渠道',
    site                        VARCHAR(32)     COMMENT '站点',
    shop_code                   VARCHAR(64)     COMMENT '店铺编码',
    asin                        VARCHAR(32)     COMMENT '亚马逊ASIN',
    sku_code                    VARCHAR(64)     COMMENT '内部SKU编码',
    spu_code                    VARCHAR(64)     COMMENT '内部SPU编码',
    rating                      DECIMAL(3,1)    COMMENT '评分(1-5星)',
    review_title                VARCHAR(512)    COMMENT '评论标题',
    review_content              VARCHAR(65533)  COMMENT '评论正文',
    sentiment                   VARCHAR(32)     COMMENT '情感倾向:positive/neutral/negative',
    images                      VARCHAR(65533)  COMMENT '评论图片URL列表(JSON数组)',
    review_time                  DATETIME        COMMENT '评论发布时间',
    reviewer_name               VARCHAR(255)    COMMENT '评论者名称',
    is_verified_purchase        TINYINT         COMMENT '是否已验证购买:1-是,0-否',
    -- TODO: 需补充:点赞数/回复数/VOC打标标签等字段
    pt                          DATETIME        COMMENT '数据处理时间'
)
ENGINE = OLAP
DUPLICATE KEY (`ds`, `voc_id`)
COMMENT 'DWB-客服域-商品评论(VOC)明细表,粒度一行一条评论,用于差评与VOC分析'
PARTITION BY (`ds`)
DISTRIBUTED BY HASH(`voc_id`)
PROPERTIES (
    "replication_num" = "3",
    "compression" = "lz4"
);


-- ----------------------------------------------------------------------------
-- 表8: dws_cs_voc_nps_review_df  商品评论NPS明细表
--   分层:DWS | 粒度:一条打标成功评论 | 优先级:P1(评论/VOC)
--   最新日期:2026-10-26 | 最新分区行数:217,790 | 关键对象数:217,790(comment_id)
--   可用性:通过,有范围限制(当前仅1个平台;SPU缺失0)
--   建议用途:商品NPS评分与体验因子分析;区分自有/竞品(data_source)
--   上游:dwb_cs_review_amazon_reviews_tag_df + dim_pd_spu_info_df +
--        dim_sal_sku_info_df + dim_pd_brand_info_df + dim_com_date_nf
--   过滤:tag_status=2(打标成功) 且 nps_overall_sentiment 属于五档
--   分区字段: ds DATE (按天分区,格式yyyy-MM-dd)
--   主键:(ds, record_id), record_id = amazon_review_{comment_id}
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lute_edw.dws_cs_voc_nps_review_df (
    ds                          DATE            COMMENT '日期分区字段,格式yyyy-MM-dd,按天分区,每日快照/增量',
    record_id                   VARCHAR(255)    COMMENT '评论打标记录业务主键,格式 amazon_review_{comment_id}',
    comment_id                  VARCHAR(64)     COMMENT '亚马逊评论ID,业务主键',
    voc_type                    VARCHAR(32)     COMMENT 'VOC类型,固定值=商品评论',
    data_source                 VARCHAR(32)     COMMENT '数据来源:自有/竞品(competitor)',
    -- 渠道维度
    platform                    VARCHAR(64)     COMMENT '平台,如Amazon',
    channel                     VARCHAR(64)     COMMENT '渠道编码',
    shop_code                   VARCHAR(64)     COMMENT '店铺编码',
    shop_name                   VARCHAR(255)    COMMENT '店铺名称',
    country_code                VARCHAR(10)     COMMENT '国家/站点编码(GB输出转为UK)',
    country_name                VARCHAR(255)    COMMENT '国家名称',
    -- 商品维度
    asin                        VARCHAR(32)     COMMENT '亚马逊ASIN',
    platform_sku               VARCHAR(128)    COMMENT '平台SKU(卖家SKU),来自dim_sal_sku_info_df.sale_sku_code',
    sku_code                    VARCHAR(64)     COMMENT '内部SKU编码',
    spu_code                    VARCHAR(64)     COMMENT '内部SPU编码',
    spu_name                    VARCHAR(255)    COMMENT 'SPU名称',
    voc_model                   VARCHAR(64)     COMMENT 'VOC型号',
    brand_name                  VARCHAR(128)    COMMENT '品牌名称(品牌维优先,空则SKU兜底)',
    is_own_brand                TINYINT         COMMENT '是否自有品牌:1-是,0-否,来自dim_pd_brand_info_df.is_own_brand',
    -- 类目/组织维度(五级类目+产品线+GTM)
    category_code_level1        VARCHAR(128)    COMMENT '一级类目编码',
    category_name_level1        VARCHAR(128)    COMMENT '一级类目名称',
    category_code_level2        VARCHAR(128)    COMMENT '二级类目编码',
    category_name_level2        VARCHAR(128)    COMMENT '二级类目名称',
    category_code_level3        VARCHAR(128)    COMMENT '三级类目编码',
    category_name_level3        VARCHAR(128)    COMMENT '三级类目名称',
    category_code_level4        VARCHAR(128)    COMMENT '四级类目编码',
    category_name_level4        VARCHAR(128)    COMMENT '四级类目名称',
    category_code_level5        VARCHAR(128)    COMMENT '五级类目编码',
    category_name_level5        VARCHAR(128)    COMMENT '五级类目名称',
    product_line_code           VARCHAR(64)     COMMENT '产品线编码',
    product_line_name           VARCHAR(255)    COMMENT '产品线名称',
    product_leader_code         VARCHAR(64)     COMMENT '产品负责人编码',
    product_leader_name         VARCHAR(255)    COMMENT '产品负责人姓名',
    gtm_code                    VARCHAR(64)     COMMENT 'GTM品线编码',
    gtm_name                    VARCHAR(255)    COMMENT 'GTM品线名称',
    gtm_leader_code              VARCHAR(64)     COMMENT 'GTM负责人编码',
    gtm_leader_name             VARCHAR(255)    COMMENT 'GTM负责人姓名',
    -- 评论内容
    rating                      DECIMAL(3,1)    COMMENT '星级评分(1-5)',
    review_title                VARCHAR(512)    COMMENT '评论标题',
    review_content              VARCHAR(65533)  COMMENT '评论正文',
    review_date                 DATE            COMMENT '评论发布日(用于上卷日/周/月)',
    week_label                  VARCHAR(32)     COMMENT '自然周标签,如2026Week31',
    month_label                 VARCHAR(16)     COMMENT '自然月标签,如2026-08',
    -- NPS打标结果
    tag_status                  TINYINT         COMMENT '打标状态:0-待处理,1-处理中,2-成功,3-失败待重试;DWS只取2',
    nps_overall_sentiment       VARCHAR(32)     COMMENT 'NPS五档中文:强烈推荐/喜欢/一般/不喜欢/强烈不推荐',
    nps_sentiment               VARCHAR(32)     COMMENT 'NPS英文枚举:strongPromoter/promoter/passive/detractor/strongDetractor',
    sentiment_bucket            TINYINT         COMMENT '情感档编号:5-强烈推荐,4-喜欢,3-一般,2-不喜欢,1-强烈不推荐',
    nps_tag_names               VARCHAR(4096)   COMMENT '体验因子标签名逗号拼接,如易用性,舒适体验',
    nps_tag_list                JSON            COMMENT '体验因子标签数组原始JSON',
    nps_brand_name              VARCHAR(128)    COMMENT 'NPS接口识别的品牌名',
    nps_persona_name            VARCHAR(128)    COMMENT 'NPS接口识别的persona',
    nps_mapping_version         VARCHAR(64)     COMMENT '标签映射版本号',
    tag_result                  JSON            COMMENT 'NPS接口返回原始item JSON',
    pt                          DATETIME        COMMENT '数据处理时间,DEFAULT CURRENT_TIMESTAMP'
)
ENGINE = OLAP
DUPLICATE KEY (`ds`, `record_id`)
COMMENT 'DWS-客服/VOC域-商品评论NPS明细宽表,粒度一行一条打标成功评论,五档情感+体验因子'
PARTITION BY (`ds`)
DISTRIBUTED BY HASH(`record_id`)
PROPERTIES (
    "replication_num" = "3",
    "compression" = "lz4"
);


-- ----------------------------------------------------------------------------
-- 表7: dwb_sal_return_sku_df  退货退款明细宽表
--   分层:DWB | 粒度:return_id/refund_id | 主题:退货退款
--   可用性:待评估(盘点表未填最新日期/行数/质量问题)
--   建议用途:退货退款分析
--   分区字段: ds DATE (按天分区,格式yyyy-MM-dd)
--   主键:(ds, return_id)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lute_edw.dwb_sal_return_sku_df (
    ds                          DATE            COMMENT '日期分区字段,格式yyyy-MM-dd,按天分区,每日快照/增量',
    return_id                   VARCHAR(64)     COMMENT '退货单ID,业务主键',
    refund_id                   VARCHAR(64)     COMMENT '退款单ID',
    platform                    VARCHAR(64)     COMMENT '平台',
    channel                     VARCHAR(64)     COMMENT '渠道',
    site                        VARCHAR(32)     COMMENT '站点',
    shop_code                   VARCHAR(64)     COMMENT '店铺编码',
    order_id                    VARCHAR(64)     COMMENT '原订单号',
    platform_sku               VARCHAR(128)    COMMENT '平台SKU',
    asin                        VARCHAR(32)     COMMENT '亚马逊ASIN',
    sku_code                    VARCHAR(64)     COMMENT '内部SKU编码',
    spu_code                    VARCHAR(64)     COMMENT '内部SPU编码',
    return_qty                  DECIMAL(18,4)   COMMENT '退货数量',
    refund_amount               DECIMAL(18,4)   COMMENT '退款金额',
    return_reason               VARCHAR(255)    COMMENT '退货原因',
    return_status               VARCHAR(32)     COMMENT '退货状态',
    return_time                 DATETIME        COMMENT '退货时间',
    -- TODO: 需补充:退款原因/退款方式/退款时间等字段
    pt                          DATETIME        COMMENT '数据处理时间'
)
ENGINE = OLAP
DUPLICATE KEY (`ds`, `return_id`)
COMMENT 'DWB-销售域-退货退款明细宽表,粒度一行一条退货/退款记录'
PARTITION BY (`ds`)
DISTRIBUTED BY HASH(`return_id`)
PROPERTIES (
    "replication_num" = "3",
    "compression" = "lz4"
);

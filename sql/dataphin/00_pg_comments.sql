-- =============================================================================
-- 00_pg_comments.sql —— PG 侧表/列注释（幂等，可反复执行）
-- =============================================================================
-- 为什么单独一个文件：
--   Prisma schema 里的 `///` 只是代码文档，**不会写进数据库**，所以 \d+ 看不到任何
--   列说明。这些注释与 01_sr_tables.sql 的 COMMENT 同源（由 01 派生，别在这里手改
--   单条 —— 改 01 再重新生成，否则两边会漂移）。
--
-- 何时跑：
--   1. 首次部署后、`prisma db push` 建完表（表结构变了注释要跟着更新）；
--   2. `prisma db push` 新增/重建过的表之后。
--   可重复执行：COMMENT ON 是覆盖语义，跑一百次结果一样。
--
-- 执行：psql -f 00_pg_comments.sql
-- 校验：见文件末尾的 SELECT。
-- 影响：纯元数据，不改数据、不加锁、不影响 Prisma。
-- =============================================================================

-- ---------------------------------------------------------------------------
-- pd_spu
-- ---------------------------------------------------------------------------
COMMENT ON TABLE pd_spu IS '商品中心 360 - SPU 主档（→ PG pd_spu）。一 SPU 一行；后 12 列为加载期预聚合，勿在查询期重算';
COMMENT ON COLUMN pd_spu.id IS 'UUID 主键，Prisma 客户端生成；DB 侧默认值由 00_pg_patch.sql 补';
COMMENT ON COLUMN pd_spu.spu_code IS 'SPU 编码，业务主键，一个商品一行';
COMMENT ON COLUMN pd_spu.ds IS '源表 ds 分区日，取行内值（不是 max 子查询）';
COMMENT ON COLUMN pd_spu.company_code IS '公司编码，多公司口径预留，页面不展示';
COMMENT ON COLUMN pd_spu.spu_name IS '商品名称（中文），列表主标题';
COMMENT ON COLUMN pd_spu.spu_name_en IS '商品英文名，模糊检索第二字段';
COMMENT ON COLUMN pd_spu.spu_alias_name IS '商品别名';
COMMENT ON COLUMN pd_spu.spu_image IS '商品主图 URL';
COMMENT ON COLUMN pd_spu.spu_level_new IS '商品等级（新），页面徽标';
COMMENT ON COLUMN pd_spu.spu_state IS '状态码：0 开发中 / 1 待上架 / 2 可销售 / 3 已下架 / 5 已取消（无 4）';
COMMENT ON COLUMN pd_spu.spu_state_desc IS '状态描述，页面直接展示；源端为空时兜底「待上架」';
COMMENT ON COLUMN pd_spu.spu_model_name IS '型号名，取 model_info.model_name，无则取任一 SKU 的值';
COMMENT ON COLUMN pd_spu.spu_product_type_desc IS '产品类型描述';
COMMENT ON COLUMN pd_spu.spu_desc IS '商品长描述';
COMMENT ON COLUMN pd_spu.selling_point IS '卖点文案';
COMMENT ON COLUMN pd_spu.product_line_code IS '产品线编码';
COMMENT ON COLUMN pd_spu.product_line_name IS '产品线名称';
COMMENT ON COLUMN pd_spu.gtm_code IS 'GTM 负责人工号';
COMMENT ON COLUMN pd_spu.gtm_name IS 'GTM 负责人姓名；质量告警「缺关键角色」判它是否为空';
COMMENT ON COLUMN pd_spu.product_leader_code IS '产品负责人工号';
COMMENT ON COLUMN pd_spu.product_leader_name IS '产品负责人姓名；质量告警判它是否为空';
COMMENT ON COLUMN pd_spu.planner_name IS '计划人员姓名；质量告警判它是否为空';
COMMENT ON COLUMN pd_spu.brand_code IS '品牌编码，是权限 scope 的过滤键之一';
COMMENT ON COLUMN pd_spu.suggest_currency IS '建议售价币种';
COMMENT ON COLUMN pd_spu.suggest_price IS '建议售价，商业字段：无权限时接口置 NULL';
COMMENT ON COLUMN pd_spu.listing_time IS '上架时间；抽样覆盖仅 76%，空值不等于未上市，不要拿它推生命周期';
COMMENT ON COLUMN pd_spu.is_new_spu IS '新品标记；本地抽样全为 NULL（源端未给值），页面不展示';
COMMENT ON COLUMN pd_spu.voc_model IS '口碑口径型号，关联竞品表用';
COMMENT ON COLUMN pd_spu.category_code IS '类目完整编码路径';
COMMENT ON COLUMN pd_spu.category_name IS '类目完整名称路径';
COMMENT ON COLUMN pd_spu.category_code_level1 IS '一级类目编码；四级级联筛选的 L1 键';
COMMENT ON COLUMN pd_spu.category_name_level1 IS '一级类目名称';
COMMENT ON COLUMN pd_spu.category_code_level2 IS '二级类目编码；L2 键';
COMMENT ON COLUMN pd_spu.category_name_level2 IS '二级类目名称';
COMMENT ON COLUMN pd_spu.category_code_level3 IS '三级类目编码；L3 键';
COMMENT ON COLUMN pd_spu.category_name_level3 IS '三级类目名称';
COMMENT ON COLUMN pd_spu.category_code_level4 IS '四级类目编码；L4 键（级联到此为止）';
COMMENT ON COLUMN pd_spu.category_name_level4 IS '四级类目名称';
COMMENT ON COLUMN pd_spu.category_code_level5 IS '五级类目编码；抽样中 100% 为空，级联已砍掉 L5，勿启用';
COMMENT ON COLUMN pd_spu.category_name_level5 IS '五级类目名称';
COMMENT ON COLUMN pd_spu.category_tag_name IS '类目标签串';
COMMENT ON COLUMN pd_spu.is_electrical_desc IS '是否带电描述';
COMMENT ON COLUMN pd_spu.class_tag_name IS '分类标签串';
COMMENT ON COLUMN pd_spu.sence_tag_name IS '场景标签串（源端拼写 sence，勿改为 scene，否则映射断裂）';
COMMENT ON COLUMN pd_spu.fmcg_tag_name IS '快消标签串';
COMMENT ON COLUMN pd_spu.iot_tag_name IS 'IoT 标签串';
COMMENT ON COLUMN pd_spu.tag_info IS '标签原始 JSON，原样透传';
COMMENT ON COLUMN pd_spu.series_info IS '系列原始 JSON，原样透传';
COMMENT ON COLUMN pd_spu.model_info IS '型号原始 JSON，spu_model_name 从这里取';
COMMENT ON COLUMN pd_spu.deleted IS '源端删除标记 0/1（本地抽样全为 0）；不是软删除主键，排查孤行时才看';
COMMENT ON COLUMN pd_spu.update_time IS '源表更新时间；SR 侧去重排序依据（取最新一条）';
COMMENT ON COLUMN pd_spu.coverage IS '数据覆盖度 0-4：有 SKU / 有渠道编码 / 有销量 / 有口碑 各计 1，列表默认按它倒序';
COMMENT ON COLUMN pd_spu.sku_count IS '该 SPU 的 SKU 数，来自 pd_sku 计数';
COMMENT ON COLUMN pd_spu.channel_count IS '该 SPU 出现过的渠道数，来自 sal_sku_code 去重计数';
COMMENT ON COLUMN pd_spu.has_sales IS '近 30 天是否有销量，列表筛选用';
COMMENT ON COLUMN pd_spu.market_countries IS '销售覆盖国家，PG text[] 字面量如 {US,DE}；无数据为 {}';
COMMENT ON COLUMN pd_spu.sales_30d_qty IS '近 30 天销量，无销量为 0';
COMMENT ON COLUMN pd_spu.sales_30d_usd IS '近 30 天销售额（USD），商业字段；源数据全为 NULL 时保持 NULL，不填 0';
COMMENT ON COLUMN pd_spu.in_stock_qty IS '在库数量，来自 scm_stock 汇总';
COMMENT ON COLUMN pd_spu.on_way_qty IS '在途数量，来自 scm_stock 汇总';
COMMENT ON COLUMN pd_spu.review_count IS '评论总数，来自自有评论（is_own_brand=1）';
COMMENT ON COLUMN pd_spu.rating_avg IS '评论星级均值 0-5';
COMMENT ON COLUMN pd_spu.lifecycle_stage IS '运营生命周期 selling/prelaunch/clearance/retired，加载期算好；优先级 retired > clearance > prelaunch > selling';

-- ---------------------------------------------------------------------------
-- pd_sku
-- ---------------------------------------------------------------------------
COMMENT ON TABLE pd_sku IS '商品中心 360 - SKU 主档（→ PG pd_sku）。一 SKU 一行，规格列单位在展示层拼接';
COMMENT ON COLUMN pd_sku.id IS 'UUID 主键，Prisma 客户端生成；DB 侧默认值由 00_pg_patch.sql 补';
COMMENT ON COLUMN pd_sku.sku_code IS 'SKU 编码，业务主键';
COMMENT ON COLUMN pd_sku.ds IS '源表 ds 分区日';
COMMENT ON COLUMN pd_sku.sku_code_new IS '新 SKU 编码（编码迁移中间态）';
COMMENT ON COLUMN pd_sku.scm_sku_code IS '供应链 SKU 编码，关联库存表的中间键';
COMMENT ON COLUMN pd_sku.sku_name IS 'SKU 名称；源端为空时兜底用 sku_code';
COMMENT ON COLUMN pd_sku.sku_name_en IS 'SKU 英文名';
COMMENT ON COLUMN pd_sku.sku_image_url IS 'SKU 主图 URL';
COMMENT ON COLUMN pd_sku.sku_state IS '状态码：0 已取消 / 1 未上架 / 2 在销售 / 3 清仓中 / 4 已退市';
COMMENT ON COLUMN pd_sku.sku_state_desc IS '状态描述，页面直接展示；lifecycle 的 clearance 判定读它';
COMMENT ON COLUMN pd_sku.brand_code IS '品牌编码';
COMMENT ON COLUMN pd_sku.brand_name IS '品牌名称';
COMMENT ON COLUMN pd_sku.suggest_currency IS '建议售价币种';
COMMENT ON COLUMN pd_sku.suggest_price IS '建议售价，商业字段：无权限时接口置 NULL';
COMMENT ON COLUMN pd_sku.spu_code IS '所属 SPU 编码，关联 pd_spu 的唯一键';
COMMENT ON COLUMN pd_sku.spu_name IS '冗余的 SPU 名称，省一次 join';
COMMENT ON COLUMN pd_sku.spu_model_name IS '冗余的型号名，可为 spu_model_name 的空值兜底';
COMMENT ON COLUMN pd_sku.spec_product_length IS '单品长，单位厘米（单位由展示层拼接）';
COMMENT ON COLUMN pd_sku.spec_product_width IS '单品宽，单位厘米';
COMMENT ON COLUMN pd_sku.spec_product_height IS '单品高，单位厘米';
COMMENT ON COLUMN pd_sku.spec_product_weight IS '单品毛重，单位千克';
COMMENT ON COLUMN pd_sku.spec_product_net_weight IS '单品净重，单位千克';
COMMENT ON COLUMN pd_sku.spec_carton_length IS '箱规长，单位厘米';
COMMENT ON COLUMN pd_sku.spec_carton_width IS '箱规宽，单位厘米';
COMMENT ON COLUMN pd_sku.spec_carton_height IS '箱规高，单位厘米';
COMMENT ON COLUMN pd_sku.spec_carton_weight IS '箱规重量，单位千克';
COMMENT ON COLUMN pd_sku.spec_carton_num IS '装箱数（每箱几个单品）';
COMMENT ON COLUMN pd_sku.spec_material IS '材质';
COMMENT ON COLUMN pd_sku.sku_color IS '颜色';
COMMENT ON COLUMN pd_sku.sku_size IS '尺寸';
COMMENT ON COLUMN pd_sku.sku_pack IS '包装规格';
COMMENT ON COLUMN pd_sku.listing_time IS 'SKU 上架时间';
COMMENT ON COLUMN pd_sku.attr_info IS '属性原始 JSON，原样透传';
COMMENT ON COLUMN pd_sku.sensitive_info IS '敏感信息 JSON，仅后端持有，不向外输出';
COMMENT ON COLUMN pd_sku.deleted IS '源端删除标记，0/1';
COMMENT ON COLUMN pd_sku.update_time IS '源表更新时间；SR 侧去重排序依据（取最新一条）';

-- ---------------------------------------------------------------------------
-- sal_sku_code
-- ---------------------------------------------------------------------------
COMMENT ON TABLE sal_sku_code IS '商品中心 360 - 渠道外部编码（→ PG sal_sku_code）。一 (渠道,站点,店铺,平台SKU,内部SKU) 一行；页面「渠道销售贡献」卡的数据源，与上架矩阵是两个源，渠道数会不同';
COMMENT ON COLUMN sal_sku_code.id IS 'UUID 主键，Prisma 客户端生成；DB 侧默认值由 00_pg_patch.sql 补';
COMMENT ON COLUMN sal_sku_code.channel IS '渠道英文标识（amazon/shopify/tiktok…），粒度第一维';
COMMENT ON COLUMN sal_sku_code.site IS '站点国家码（US/DE/UK…）；注意源端 UK 与 GB 并存，不归一';
COMMENT ON COLUMN sal_sku_code.shop_code IS '店铺编码，粒度第三维';
COMMENT ON COLUMN sal_sku_code.sale_sku_code IS '平台侧 SKU（ASIN 或店铺自定义码），即页面「平台 SKU」';
COMMENT ON COLUMN sal_sku_code.sku_code IS '映射到的内部 SKU 编码；为 NULL 的行说明映射缺失';
COMMENT ON COLUMN sal_sku_code.ds IS '源表 ds 分区日';
COMMENT ON COLUMN sal_sku_code.channel_name IS '渠道中文名（亚马逊/Tiktok平台…），页面展示用';
COMMENT ON COLUMN sal_sku_code.shop_name IS '店铺名称';
COMMENT ON COLUMN sal_sku_code.asin IS '亚马逊 ASIN，非亚马逊渠道为空';
COMMENT ON COLUMN sal_sku_code.parent_asin IS '父 ASIN（变体组）';
COMMENT ON COLUMN sal_sku_code.asin_url IS 'ASIN 页面链接';
COMMENT ON COLUMN sal_sku_code.scm_sku_code IS '供应链 SKU 编码';
COMMENT ON COLUMN sal_sku_code.spu_code IS '映射到的 SPU 编码';
COMMENT ON COLUMN sal_sku_code.listing_status IS '上架状态原值；注意存在脏值 ''11''（实测 22 行），新表已改读 sal_sku_online_listing';
COMMENT ON COLUMN sal_sku_code.sal_listing_time IS '渠道上架时间';
COMMENT ON COLUMN sal_sku_code.first_order_time IS '该编码首单时间';
COMMENT ON COLUMN sal_sku_code.suggest_currency IS '建议售价币种';
COMMENT ON COLUMN sal_sku_code.suggest_price IS '建议售价，商业字段：无权限时接口置 NULL';
COMMENT ON COLUMN sal_sku_code.sale_sku_qty IS '该编码的销售数量汇总';
COMMENT ON COLUMN sal_sku_code.sal_image_url IS '渠道侧商品图 URL';
COMMENT ON COLUMN sal_sku_code.category_name_level1 IS '渠道侧一级类目名（源端口径，与 pd_spu 类目不同源）';
COMMENT ON COLUMN sal_sku_code.listing_operator IS '渠道上架操作人姓名';

-- ---------------------------------------------------------------------------
-- sal_sku_online_listing
-- ---------------------------------------------------------------------------
COMMENT ON TABLE sal_sku_online_listing IS '商品中心 360 - 全渠道在线商品宽表（→ PG sal_sku_online_listing）。listing 级快照，一平台上架项一行；去重键必须含 external_id';
COMMENT ON COLUMN sal_sku_online_listing.id IS 'UUID 主键，Prisma 客户端生成；DB 侧默认值由 00_pg_patch.sql 补';
COMMENT ON COLUMN sal_sku_online_listing.channel IS '渠道英文标识，粒度第一维（本地抽样 11 个值，生产会更多）';
COMMENT ON COLUMN sal_sku_online_listing.site IS '站点国家码；可为空，故不能进 PRIMARY KEY';
COMMENT ON COLUMN sal_sku_online_listing.shop_code IS '店铺编码；可为空';
COMMENT ON COLUMN sal_sku_online_listing.msku IS '平台侧商家 SKU（merchant SKU），listing 粒度键';
COMMENT ON COLUMN sal_sku_online_listing.ds IS '源表 ds 分区日';
COMMENT ON COLUMN sal_sku_online_listing.external_id IS '平台侧商品唯一 id（Shopify product id / ASIN 等）；去重键第 5 列，缺了会丢 16.5% 的行';
COMMENT ON COLUMN sal_sku_online_listing.external_id_type IS 'external_id 的类型标识，说明上列是哪种 id';
COMMENT ON COLUMN sal_sku_online_listing.parent_external_id IS '父级商品 id（变体组/父 ASIN），可变体归组用';
COMMENT ON COLUMN sal_sku_online_listing.sku_code IS '映射到的内部 SKU 编码；为空说明该 listing 缺内部映射';
COMMENT ON COLUMN sal_sku_online_listing.scm_sku_code IS '供应链 SKU 编码';
COMMENT ON COLUMN sal_sku_online_listing.spu_code IS '映射到的 SPU 编码；本地抽样中与 sku_code 同空同非空，为空的行落不到任何商品页';
COMMENT ON COLUMN sal_sku_online_listing.title IS 'listing 标题';
COMMENT ON COLUMN sal_sku_online_listing.description_summary IS '描述摘要（源端已截断），明细展开行展示';
COMMENT ON COLUMN sal_sku_online_listing.main_image_url IS 'listing 主图 URL';
COMMENT ON COLUMN sal_sku_online_listing.listing_status IS '已归一的上架状态：online/offline/draft/deleted 四值（替换了旧表的脏值 11）';
COMMENT ON COLUMN sal_sku_online_listing.listing_status_raw IS '源端原始状态（下架|正常 / AVAILABLE_FOR_SALE / active / draft…），作 Tooltip 解释归一来源';
COMMENT ON COLUMN sal_sku_online_listing.operator_name IS '渠道侧运营负责人姓名';
COMMENT ON COLUMN sal_sku_online_listing.currency_code IS '币种（本地抽样 14 种），跨渠道不可直接比价';
COMMENT ON COLUMN sal_sku_online_listing.list_price IS '标价，商业字段：无权限时接口置 NULL';
COMMENT ON COLUMN sal_sku_online_listing.sale_price IS '售价，商业字段：无权限时接口置 NULL';
COMMENT ON COLUMN sal_sku_online_listing.barcode IS '条码（UPC/EAN 等）';
COMMENT ON COLUMN sal_sku_online_listing.inventory_qty IS '渠道侧库存数量（源端口径，非「可售」细分）';
COMMENT ON COLUMN sal_sku_online_listing.rating IS 'listing 自身星级 0-5，不是评论聚合值（评论聚合看 voc_review_day）';
COMMENT ON COLUMN sal_sku_online_listing.content_item_cnt IS '内容完整项数 1-5，等于后 5 个 has_* 之和（本地 2000 行 100% 自洽），源端算好原样透传';
COMMENT ON COLUMN sal_sku_online_listing.has_title IS '0/1：有无标题。是 int 不是 boolean，判定用 = 0';
COMMENT ON COLUMN sal_sku_online_listing.has_main_image IS '0/1：有无主图';
COMMENT ON COLUMN sal_sku_online_listing.has_description IS '0/1：有无描述；online 行里缺描述最多，是质量告警的主要命中项';
COMMENT ON COLUMN sal_sku_online_listing.has_price IS '0/1：有售价，语义等价于 sale_price > 0';
COMMENT ON COLUMN sal_sku_online_listing.has_status IS '0/1：有上架状态';
COMMENT ON COLUMN sal_sku_online_listing.product_link IS '平台商品页链接';
COMMENT ON COLUMN sal_sku_online_listing.src_table IS '上游源表名，三张之一：dwb_sal_sku_amazon_df / dwb_sal_sku_jijia_listing_df / dwb_sal_sku_shopify_df';

-- ---------------------------------------------------------------------------
-- sal_sku_day
-- ---------------------------------------------------------------------------
COMMENT ON TABLE sal_sku_day IS '商品中心 360 - 销售日汇总（→ PG sal_sku_day）。一天一平台一店铺一站点一平台SKU 一行；order_qty ≠ sale_qty';
COMMENT ON COLUMN sal_sku_day.id IS 'UUID 主键，Prisma 客户端生成；DB 侧默认值由 00_pg_patch.sql 补';
COMMENT ON COLUMN sal_sku_day.order_date IS '订单日期，粒度第一维（按天）';
COMMENT ON COLUMN sal_sku_day.platform IS '平台中文名（亚马逊/Tiktok平台…），与 channel 不同源：它是中文展示名';
COMMENT ON COLUMN sal_sku_day.shop IS '店铺编码，粒度第三维（本地抽样 67 个）';
COMMENT ON COLUMN sal_sku_day.country_code IS '站点国家码（本地抽样 23 个）';
COMMENT ON COLUMN sal_sku_day.platform_sku IS '平台侧 SKU 编码，粒度第五维';
COMMENT ON COLUMN sal_sku_day.ds IS '源表 ds 分区日';
COMMENT ON COLUMN sal_sku_day.channel IS '渠道英文标识（amazon/tiktok…）；与 platform 是「英文键 vs 中文名」的关系，不能混用';
COMMENT ON COLUMN sal_sku_day.country_name IS '站点国家名';
COMMENT ON COLUMN sal_sku_day.asin IS '亚马逊 ASIN';
COMMENT ON COLUMN sal_sku_day.parent_asin IS '父 ASIN';
COMMENT ON COLUMN sal_sku_day.sku_code IS '映射到的内部 SKU 编码';
COMMENT ON COLUMN sal_sku_day.spu_code IS '映射到的 SPU 编码；质量告警「有销量但非在售」用它关联主档';
COMMENT ON COLUMN sal_sku_day.spu_name IS '冗余 SPU 名';
COMMENT ON COLUMN sal_sku_day.sku_name IS '冗余 SKU 名';
COMMENT ON COLUMN sal_sku_day.brand_code IS '品牌编码';
COMMENT ON COLUMN sal_sku_day.category_name_level1 IS '一级类目名（销售表口径）';
COMMENT ON COLUMN sal_sku_day.order_qty IS '订单件数（含未付款/已取消），不等于销量';
COMMENT ON COLUMN sal_sku_day.sale_qty IS '销售件数（页面的「销量」口径）；为 0 时不要当空值处理';
COMMENT ON COLUMN sal_sku_day.sales_amount IS '销售额（原币），商业字段；全为 NULL 时保持 NULL，不填 0';
COMMENT ON COLUMN sal_sku_day.sales_amount_usd IS '销售额（USD），商业字段；全为 NULL 时保持 NULL，不填 0';
COMMENT ON COLUMN sal_sku_day.after_sale_replacement_qty IS '售后换货数量，页面叫 return_qty（列名与字段名不一致，集成任务按列名映射别手抄）';

-- ---------------------------------------------------------------------------
-- scm_stock
-- ---------------------------------------------------------------------------
COMMENT ON TABLE scm_stock IS '商品中心 360 - 渠道库存（→ PG scm_stock）。按 渠道/国家/SKU/仓库 一行；只用于汇总在库与在途，页面不直接展示明细';
COMMENT ON COLUMN scm_stock.id IS 'UUID 主键，Prisma 客户端生成；DB 侧默认值由 00_pg_patch.sql 补';
COMMENT ON COLUMN scm_stock.channel_code IS '渠道编码，粒度第一维';
COMMENT ON COLUMN scm_stock.country_code IS '国家/站点码，粒度第二维';
COMMENT ON COLUMN scm_stock.sku_code IS '内部 SKU 编码，粒度第三维';
COMMENT ON COLUMN scm_stock.warehouse_code IS '仓库编码，粒度第四维；源端可为空，故用 DUPLICATE KEY';
COMMENT ON COLUMN scm_stock.ds IS '源表 ds 分区日';
COMMENT ON COLUMN scm_stock.warehouse_name IS '仓库名称';
COMMENT ON COLUMN scm_stock.in_stock_qty IS '在库数量，汇总到 pd_spu.in_stock_qty';
COMMENT ON COLUMN scm_stock.on_way_qty IS '在途数量，汇总到 pd_spu.on_way_qty';

-- ---------------------------------------------------------------------------
-- voc_review_day
-- ---------------------------------------------------------------------------
COMMENT ON TABLE voc_review_day IS '商品中心 360 - 评论日汇总（→ PG voc_review_day）。只含自有品牌（is_own_brand=1），竞品在 voc_competitor';
COMMENT ON COLUMN voc_review_day.id IS 'UUID 主键，Prisma 客户端生成；DB 侧默认值由 00_pg_patch.sql 补';
COMMENT ON COLUMN voc_review_day.spu_code IS 'SPU 编码，粒度第一维';
COMMENT ON COLUMN voc_review_day.review_date IS '评论日期，粒度第二维';
COMMENT ON COLUMN voc_review_day.ds IS '源表 ds 分区日';
COMMENT ON COLUMN voc_review_day.rating_avg IS '当日星级均值 0-5';
COMMENT ON COLUMN voc_review_day.review_count IS '当日评论数；汇总后写入 pd_spu.review_count';
COMMENT ON COLUMN voc_review_day.source IS '上游源表名，用于溯源';

-- ---------------------------------------------------------------------------
-- voc_nps_sentiment
-- ---------------------------------------------------------------------------
COMMENT ON TABLE voc_nps_sentiment IS '商品中心 360 - NPS 情绪分布（→ PG voc_nps_sentiment）。一 SPU 五档情绪各一行；排序用 bucket 不用 sentiment';
COMMENT ON COLUMN voc_nps_sentiment.id IS 'UUID 主键，Prisma 客户端生成；DB 侧默认值由 00_pg_patch.sql 补';
COMMENT ON COLUMN voc_nps_sentiment.spu_code IS 'SPU 编码，粒度第一维';
COMMENT ON COLUMN voc_nps_sentiment.sentiment IS '情绪档名称（与 bucket 一一对应）';
COMMENT ON COLUMN voc_nps_sentiment.ds IS '源表 ds 分区日';
COMMENT ON COLUMN voc_nps_sentiment.bucket IS '情绪档序 0 差 … 4 好，页面按它排序（不按 sentiment 字符串排序）';
COMMENT ON COLUMN voc_nps_sentiment.item_count IS '该档的提及数';
COMMENT ON COLUMN voc_nps_sentiment.ratio IS '该档占比 0-1 小数，不是百分数；各档 ratio 之和不一定等于 1（源端口径）';
COMMENT ON COLUMN voc_nps_sentiment.source IS '上游源表名，用于溯源';

-- ---------------------------------------------------------------------------
-- voc_nps_tag
-- ---------------------------------------------------------------------------
COMMENT ON TABLE voc_nps_tag IS '商品中心 360 - 体验因子（→ PG voc_nps_tag）。源端 nps_tag_list 是 JSON 数组，已展平成一行一个因子';
COMMENT ON COLUMN voc_nps_tag.id IS 'UUID 主键，Prisma 客户端生成；DB 侧默认值由 00_pg_patch.sql 补';
COMMENT ON COLUMN voc_nps_tag.spu_code IS 'SPU 编码，粒度第一维';
COMMENT ON COLUMN voc_nps_tag.tag_name IS '体验因子名称（由 nps_tag_list 数组展开而来，一行一个因子）';
COMMENT ON COLUMN voc_nps_tag.sentiment IS '所属情绪档，粒度第三维';
COMMENT ON COLUMN voc_nps_tag.ds IS '源表 ds 分区日';
COMMENT ON COLUMN voc_nps_tag.tag_count IS '该因子在该档下的提及数';
COMMENT ON COLUMN voc_nps_tag.ratio IS '该因子占比 0-1 小数';
COMMENT ON COLUMN voc_nps_tag.source IS '上游源表名，用于溯源';

-- ---------------------------------------------------------------------------
-- voc_ticket_topic
-- ---------------------------------------------------------------------------
COMMENT ON TABLE voc_ticket_topic IS '商品中心 360 - 工单主题（→ PG voc_ticket_topic）。一 SPU 一主题一行；voc_type 是附加分类维度，不在键里';
COMMENT ON COLUMN voc_ticket_topic.id IS 'UUID 主键，Prisma 客户端生成；DB 侧默认值由 00_pg_patch.sql 补';
COMMENT ON COLUMN voc_ticket_topic.spu_code IS 'SPU 编码，粒度第一维';
COMMENT ON COLUMN voc_ticket_topic.topic IS '工单主题名，粒度第二维';
COMMENT ON COLUMN voc_ticket_topic.ds IS '源表 ds 分区日';
COMMENT ON COLUMN voc_ticket_topic.voc_type IS '工单 VOC 类型（分类维度）';
COMMENT ON COLUMN voc_ticket_topic.ticket_count IS '该主题的工单数';
COMMENT ON COLUMN voc_ticket_topic.ratio IS '该主题占比 0-1 小数';
COMMENT ON COLUMN voc_ticket_topic.source IS '上游源表名，用于溯源';

-- ---------------------------------------------------------------------------
-- voc_competitor
-- ---------------------------------------------------------------------------
COMMENT ON TABLE voc_competitor IS '商品中心 360 - 竞品口碑（→ PG voc_competitor）。竞品口径 is_own_brand <> 1，与自有评论完全分开';
COMMENT ON COLUMN voc_competitor.id IS 'UUID 主键，Prisma 客户端生成；DB 侧默认值由 00_pg_patch.sql 补';
COMMENT ON COLUMN voc_competitor.brand_name IS '竞品品牌名，粒度第一维';
COMMENT ON COLUMN voc_competitor.voc_model IS '竞品型号，粒度第二维';
COMMENT ON COLUMN voc_competitor.ds IS '源表 ds 分区日';
COMMENT ON COLUMN voc_competitor.spu_code IS '恒为 NULL：竞品行没有内部 SPU。保留列只为与 PG 列对齐，别用它对竞品做 SPU 关联';
COMMENT ON COLUMN voc_competitor.rating_avg IS '竞品星级均值 0-5';
COMMENT ON COLUMN voc_competitor.review_count IS '竞品评论数';
COMMENT ON COLUMN voc_competitor.source IS '上游源表名，用于溯源';

-- ---------------------------------------------------------------------------
-- sync_batch
-- ---------------------------------------------------------------------------
COMMENT ON TABLE sync_batch IS '商品中心 360 - 同步批次（→ PG sync_batch）。页面 asOf / delayed 的唯一来源，必须最后跑，漏跑则全区显示延迟';
COMMENT ON COLUMN sync_batch.id IS 'UUID 主键，Prisma 客户端生成；DB 侧默认值由 00_pg_patch.sql 补';
COMMENT ON COLUMN sync_batch.batch_id IS '批次 id，一次同步任务一个';
COMMENT ON COLUMN sync_batch.source_table IS '本次同步写的是哪张表（写 PG 表名，不是 SR 表名）';
COMMENT ON COLUMN sync_batch.source_ds IS '本批次数据的源分区日，页面的 asOf 就去这里取';
COMMENT ON COLUMN sync_batch.row_count IS '本批次写入行数，验收时用它对账';
COMMENT ON COLUMN sync_batch.status IS 'success / failed；页面 delayed 判定只看 success 的 finished_at';
COMMENT ON COLUMN sync_batch.message IS '失败原因或备注，排障看这里';
COMMENT ON COLUMN sync_batch.started_at IS '任务开始时间';
COMMENT ON COLUMN sync_batch.finished_at IS '任务结束时间；超过 48h 未更新则页面标 delayed（THRESHOLD可调）';

-- ---------------------------------------------------------------------------
-- 校验：每张表都应有注释，且没有空注释的列
-- ---------------------------------------------------------------------------
SELECT c.relname AS table_name,
       obj_description(c.oid) AS table_comment,
       count(a.attname) FILTER (WHERE col_description(c.oid, a.attnum) IS NOT NULL) AS commented_cols,
       count(a.attname) AS total_cols
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
WHERE n.nspname = 'public' AND c.relkind = 'r'
  AND c.relname IN ('pd_spu', 'pd_sku', 'sal_sku_code', 'sal_sku_online_listing', 'sal_sku_day', 'scm_stock', 'voc_review_day', 'voc_nps_sentiment', 'voc_nps_tag', 'voc_ticket_topic', 'voc_competitor', 'sync_batch')
GROUP BY c.relname, c.oid
ORDER BY c.relname;

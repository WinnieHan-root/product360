-- =============================================================================
-- 40_sal_sku_online_listing.sql
--   ads_sal_sku_online_listing_df → p360_sal_sku_online_listing（全渠道在线商品）
-- =============================================================================
-- 清洗规则（对齐 loader.ts: loadSalSkuOnlineListing）：
--   1. channel / msku / listing_status 任一为空 → 丢弃
--   2. 去重键 = channel | site | shop_code | msku | external_id
--      同键多行取 ds 最新、external_id 较小的一条（确定性排序，不依赖文件顺序）
--      必须带 external_id：同一内部 SKU 在 Shopify 会被重复建成多个商品（各有独立
--      product id），只按前四列去重会丢掉约 16% 的行；带上后样例 2000/2000 唯一
--   3. listing_status 为源端已归一值 online/offline/deleted；
--      listing_status_raw 保留源端原值（「下架|正常」「AVAILABLE_FOR_SALE」等）
--   4. has_* 为 0/1 标记；content_item_cnt 是五项之和（含恒为 1 的 has_status）
--      —— 这五个标记源端已算好，本脚本原样透传，不重算、不改口径
--   5. 金额列空值保持 null；inventory_qty / rating 同理，源端为空不补 0
--   6. 源端 pt 列是任务执行时间戳，不落库（asOf 由 ds + sync_batch 提供）
--
-- 注意：本表当前覆盖 amazon / shopify / shopee / lazada / mercadolibre /
--       mercadolibre_local / shein / aliexpress / aliexpress_pop_choice / cdiscount /
--       shoplazza 共 11 个渠道值（3 张源表：amazon / jijia / shopify），
--       但仍不是公司全部销售渠道，页面必须标注实际覆盖范围。
--       listing_status 实测 4 值：online / offline / deleted / draft（draft 仅 shopify，
--       是「店铺里已建好但未发布」的商品，内容多半已填满，不能并入 offline）。
-- =============================================================================

INSERT INTO p360_sal_sku_online_listing
SELECT
  c.channel,
  c.site,
  c.shop_code,
  c.msku,
  c.ds,
  c.external_id,
  c.external_id_type,
  c.parent_external_id,
  c.sku_code,
  c.scm_sku_code,
  c.spu_code,
  c.title,
  c.description_summary,
  c.main_image_url,
  c.listing_status,
  c.listing_status_raw,
  c.operator_name,
  c.currency_code,
  c.list_price,
  c.sale_price,
  c.barcode,
  c.inventory_qty,
  c.rating,
  c.content_item_cnt,
  c.has_title,
  c.has_main_image,
  c.has_description,
  c.has_price,
  c.has_status,
  c.product_link,
  c.src_table
FROM (
  SELECT
    src.*,
    row_number() OVER (
      PARTITION BY src.channel, src.site, src.shop_code, src.msku, src.external_id
      ORDER BY src.ds DESC, src.external_id
    ) AS rn
  FROM (
    SELECT
      /* channel */               case when lower(cast(s.channel as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$' then null else regexp_replace(cast(s.channel as string), '^[[:space:]]+|[[:space:]]+$', '') end AS channel,
      /* site */                  case when lower(cast(s.site as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$' then null else regexp_replace(cast(s.site as string), '^[[:space:]]+|[[:space:]]+$', '') end AS site,
      /* shop_code */             case when lower(cast(s.shop_code as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$' then null else regexp_replace(cast(s.shop_code as string), '^[[:space:]]+|[[:space:]]+$', '') end AS shop_code,
      /* msku */                  case when lower(cast(s.msku as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$' then null else regexp_replace(cast(s.msku as string), '^[[:space:]]+|[[:space:]]+$', '') end AS msku,
      /* ds */                    cast(s.ds as date) AS ds,
      /* external_id */           coalesce(case when lower(cast(s.external_id as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$' then null else regexp_replace(cast(s.external_id as string), '^[[:space:]]+|[[:space:]]+$', '') end, '') AS external_id,
      /* external_id_type */      coalesce(case when lower(cast(s.external_id_type as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$' then null else regexp_replace(cast(s.external_id_type as string), '^[[:space:]]+|[[:space:]]+$', '') end, '') AS external_id_type,
      /* parent_external_id */    case when lower(cast(s.parent_external_id as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$' then null else regexp_replace(cast(s.parent_external_id as string), '^[[:space:]]+|[[:space:]]+$', '') end AS parent_external_id,
      /* sku_code */              case when lower(cast(s.sku_code as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$' then null else regexp_replace(cast(s.sku_code as string), '^[[:space:]]+|[[:space:]]+$', '') end AS sku_code,
      /* scm_sku_code */          case when lower(cast(s.scm_sku_code as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$' then null else regexp_replace(cast(s.scm_sku_code as string), '^[[:space:]]+|[[:space:]]+$', '') end AS scm_sku_code,
      /* spu_code */              case when lower(cast(s.spu_code as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$' then null else regexp_replace(cast(s.spu_code as string), '^[[:space:]]+|[[:space:]]+$', '') end AS spu_code,
      /* title */                 case when lower(cast(s.title as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$' then null else regexp_replace(cast(s.title as string), '^[[:space:]]+|[[:space:]]+$', '') end AS title,
      /* description_summary */   case when lower(cast(s.description_summary as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$' then null else regexp_replace(cast(s.description_summary as string), '^[[:space:]]+|[[:space:]]+$', '') end AS description_summary,
      /* main_image_url */        case when lower(cast(s.main_image_url as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$' then null else regexp_replace(cast(s.main_image_url as string), '^[[:space:]]+|[[:space:]]+$', '') end AS main_image_url,
      /* listing_status */        case when lower(cast(s.listing_status as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$' then null else regexp_replace(cast(s.listing_status as string), '^[[:space:]]+|[[:space:]]+$', '') end AS listing_status,
      /* listing_status_raw */    coalesce(case when lower(cast(s.listing_status_raw as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$' then null else regexp_replace(cast(s.listing_status_raw as string), '^[[:space:]]+|[[:space:]]+$', '') end, '') AS listing_status_raw,
      /* operator_name */         case when lower(cast(s.operator_name as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$' then null else regexp_replace(cast(s.operator_name as string), '^[[:space:]]+|[[:space:]]+$', '') end AS operator_name,
      /* currency_code */         case when lower(cast(s.currency_code as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$' then null else regexp_replace(cast(s.currency_code as string), '^[[:space:]]+|[[:space:]]+$', '') end AS currency_code,
      /* list_price */            cast(nullif(regexp_replace(cast(s.list_price as string), ',', ''), '') as decimal(18, 4)) AS list_price,
      /* sale_price */            cast(nullif(regexp_replace(cast(s.sale_price as string), ',', ''), '') as decimal(18, 4)) AS sale_price,
      /* barcode */               case when lower(cast(s.barcode as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$' then null else regexp_replace(cast(s.barcode as string), '^[[:space:]]+|[[:space:]]+$', '') end AS barcode,
      /* inventory_qty */         cast(round(cast(nullif(regexp_replace(cast(s.inventory_qty as string), ',', ''), '') as double)) as bigint) AS inventory_qty,
      /* rating */                cast(nullif(regexp_replace(cast(s.rating as string), ',', ''), '') as decimal(3, 2)) AS rating,
      /* content_item_cnt */      coalesce(cast(round(cast(nullif(regexp_replace(cast(s.content_item_cnt as string), ',', ''), '') as double)) as bigint), 0) AS content_item_cnt,
      /* has_title */             coalesce(cast(round(cast(nullif(regexp_replace(cast(s.has_title as string), ',', ''), '') as double)) as bigint), 0) AS has_title,
      /* has_main_image */        coalesce(cast(round(cast(nullif(regexp_replace(cast(s.has_main_image as string), ',', ''), '') as double)) as bigint), 0) AS has_main_image,
      /* has_description */       coalesce(cast(round(cast(nullif(regexp_replace(cast(s.has_description as string), ',', ''), '') as double)) as bigint), 0) AS has_description,
      /* has_price */             coalesce(cast(round(cast(nullif(regexp_replace(cast(s.has_price as string), ',', ''), '') as double)) as bigint), 0) AS has_price,
      /* has_status */            coalesce(cast(round(cast(nullif(regexp_replace(cast(s.has_status as string), ',', ''), '') as double)) as bigint), 0) AS has_status,
      /* product_link */          case when lower(cast(s.product_link as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$' then null else regexp_replace(cast(s.product_link as string), '^[[:space:]]+|[[:space:]]+$', '') end AS product_link,
      /* src_table */             coalesce(case when lower(cast(s.src_table as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$' then null else regexp_replace(cast(s.src_table as string), '^[[:space:]]+|[[:space:]]+$', '') end, '') AS src_table
    FROM ads_sal_sku_online_listing_df s
    WHERE s.ds = '${bizdate}'
  ) src
  WHERE src.channel IS NOT NULL
    AND src.msku IS NOT NULL
    AND src.listing_status IS NOT NULL
) c
WHERE c.rn = 1;

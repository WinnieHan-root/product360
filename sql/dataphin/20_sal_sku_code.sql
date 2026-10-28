-- =============================================================================
-- 20_sal_sku_code.sql —— dim_sal_sku_info_df → p360_sal_sku_code（渠道外部编码）
-- =============================================================================
-- 清洗规则（对齐 loader.ts: loadSalSkuCode）：
--   1. sale_sku_code / channel 任一为空 → 丢弃（这两个是业务主键的一半）
--   2. 去重键 = channel | site | shop_code | sale_sku_code | sku_code
--   3. 同键多行 → 取 sal_listing_time 最新的一条
--      （loader 是「文件最后一行覆盖」；这张源表没有 update_time，
--        用 sal_listing_time 排序更合理。样例数据上两者差 1 行，是同一个平台
--        SKU 的两条重复记录，SR 版取上架时间更新的那条）
--   4. 价格取 sku_suggest_price，币种取 sku_suggest_currency
--   5. 源表没有 UPC / GTIN / EAN，页面按「未接入」展示（不造值）
-- =============================================================================

INSERT INTO p360_sal_sku_code
SELECT
  c.channel,
  c.site,
  c.shop_code,
  c.sale_sku_code,
  c.sku_code,
  c.ds,
  c.channel_name,
  c.shop_name,
  c.asin,
  c.parent_asin,
  c.asin_url,
  c.scm_sku_code,
  c.spu_code,
  c.listing_status,
  c.sal_listing_time,
  c.first_order_time,
  c.suggest_currency,
  c.suggest_price,
  c.sale_sku_qty,
  c.sal_image_url,
  c.category_name_level1,
  c.listing_operator
FROM (
  SELECT
    src.*,
    row_number() OVER (
      PARTITION BY src.channel, src.site, src.shop_code, src.sale_sku_code, src.sku_code
      ORDER BY src.sal_listing_time DESC, src.sale_sku_code
    ) AS rn
  FROM (
    SELECT
      cast(s.ds as date) AS ds,
      /* channel */       case when lower(cast(s.channel as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$' then null else regexp_replace(cast(s.channel as string), '^[[:space:]]+|[[:space:]]+$', '') end AS channel,
      /* channel_name */  case when lower(cast(s.channel_name as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$' then null else regexp_replace(cast(s.channel_name as string), '^[[:space:]]+|[[:space:]]+$', '') end AS channel_name,
      /* site */          case when lower(cast(s.site as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$' then null else regexp_replace(cast(s.site as string), '^[[:space:]]+|[[:space:]]+$', '') end AS site,
      /* shop_code */     case when lower(cast(s.shop_code as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$' then null else regexp_replace(cast(s.shop_code as string), '^[[:space:]]+|[[:space:]]+$', '') end AS shop_code,
      /* shop_name */     case when lower(cast(s.shop_name as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$' then null else regexp_replace(cast(s.shop_name as string), '^[[:space:]]+|[[:space:]]+$', '') end AS shop_name,
      /* sale_sku_code */ case when lower(cast(s.sale_sku_code as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$' then null else regexp_replace(cast(s.sale_sku_code as string), '^[[:space:]]+|[[:space:]]+$', '') end AS sale_sku_code,
      /* asin */          case when lower(cast(s.asin as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$' then null else regexp_replace(cast(s.asin as string), '^[[:space:]]+|[[:space:]]+$', '') end AS asin,
      /* parent_asin */   case when lower(cast(s.parent_asin as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$' then null else regexp_replace(cast(s.parent_asin as string), '^[[:space:]]+|[[:space:]]+$', '') end AS parent_asin,
      /* asin_url */      case when lower(cast(s.asin_url as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$' then null else regexp_replace(cast(s.asin_url as string), '^[[:space:]]+|[[:space:]]+$', '') end AS asin_url,
      /* sku_code */      case when lower(cast(s.sku_code as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$' then null else regexp_replace(cast(s.sku_code as string), '^[[:space:]]+|[[:space:]]+$', '') end AS sku_code,
      /* scm_sku_code */  case when lower(cast(s.scm_sku_code as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$' then null else regexp_replace(cast(s.scm_sku_code as string), '^[[:space:]]+|[[:space:]]+$', '') end AS scm_sku_code,
      /* spu_code */      case when lower(cast(s.spu_code as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$' then null else regexp_replace(cast(s.spu_code as string), '^[[:space:]]+|[[:space:]]+$', '') end AS spu_code,
      /* listing_status */case when lower(cast(s.listing_status as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$' then null else regexp_replace(cast(s.listing_status as string), '^[[:space:]]+|[[:space:]]+$', '') end AS listing_status,
      cast(nullif(left(cast(s.sal_listing_time as string), 19), '') as datetime) AS sal_listing_time,
      cast(nullif(left(cast(s.first_order_time as string), 19), '') as datetime) AS first_order_time,
      /* currency */      case when lower(cast(s.sku_suggest_currency as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$' then null else regexp_replace(cast(s.sku_suggest_currency as string), '^[[:space:]]+|[[:space:]]+$', '') end AS suggest_currency,
      cast(nullif(regexp_replace(cast(s.sku_suggest_price as string), ',', ''), '') as decimal(18, 4)) AS suggest_price,
      cast(round(cast(nullif(regexp_replace(cast(s.sal_sku_qty as string), ',', ''), '') as double)) as bigint) AS sale_sku_qty,
      /* image */         case when lower(cast(s.sal_image_url as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$' then null else regexp_replace(cast(s.sal_image_url as string), '^[[:space:]]+|[[:space:]]+$', '') end AS sal_image_url,
      /* category_l1 */   case when lower(cast(s.category_name_level1 as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$' then null else regexp_replace(cast(s.category_name_level1 as string), '^[[:space:]]+|[[:space:]]+$', '') end AS category_name_level1,
      /* operator */      case when lower(cast(s.sal_operator_name as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$' then null else regexp_replace(cast(s.sal_operator_name as string), '^[[:space:]]+|[[:space:]]+$', '') end AS listing_operator
    FROM dim_sal_sku_info_df s
    WHERE s.ds = '${bizdate}'
  ) src
  WHERE src.sale_sku_code IS NOT NULL
    AND src.channel IS NOT NULL
) c
WHERE c.rn = 1;
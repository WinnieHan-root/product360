-- =============================================================================
-- 21_sal_sku_day.sql —— dws_sal_sku_statistics_td_df → p360_sal_sku_day（销售日汇总）
-- =============================================================================
-- 清洗规则（对齐 loader.ts: loadSalSkuDay）：
--   1. order_date / platform / platform_sku 任一为空 → 丢弃
--   2. 粒度 = order_date | platform | shop | country_code | platform_sku
--      **同一粒度多行要相加**
--   3. 累加列：order_qty、sale_qty、after_sale_replacement_qty（页面叫 return_qty）
--   4. 金额列 sales_amount / sales_amount_usd：只累加非空值；
--      全部为 NULL 时结果保持 NULL（**不补 0**，页面显示「未接入」）
--      sum() 在 SR / PG 里都自动忽略 NULL，所以直接用 sum 即可
--   5. 其余维度/名称列取该粒度任一行（用 min() 保证可重跑）
--   6. 源表没有「退货数量」列，return_qty 的语义 = 售后换货数量
-- =============================================================================

INSERT INTO p360_sal_sku_day
SELECT
  s.order_date,
  s.platform,
  s.shop,
  s.country_code,
  s.platform_sku,
  min(s.ds)                     AS ds,
  min(s.channel)                AS channel,
  min(s.country_name)           AS country_name,
  min(s.asin)                   AS asin,
  min(s.parent_asin)            AS parent_asin,
  min(s.sku_code)               AS sku_code,
  min(s.spu_code)               AS spu_code,
  min(s.spu_name)               AS spu_name,
  min(s.sku_name)               AS sku_name,
  min(s.brand_code)             AS brand_code,
  min(s.category_name_level1)   AS category_name_level1,
  sum(coalesce(s.order_qty, 0))  AS order_qty,
  sum(coalesce(s.sale_qty, 0))   AS sale_qty,
  sum(s.sales_amount)            AS sales_amount,
  sum(s.sales_amount_usd)        AS sales_amount_usd,
  sum(coalesce(s.after_sale_replacement_qty, 0)) AS after_sale_replacement_qty
FROM (
  SELECT
    cast(nullif(left(cast(d.order_date as string), 10), '') as date) AS order_date,
    /* platform */       case when lower(cast(d.platform as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$' then null else regexp_replace(cast(d.platform as string), '^[[:space:]]+|[[:space:]]+$', '') end AS platform,
    /* channel */        case when lower(cast(d.channel as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$' then null else regexp_replace(cast(d.channel as string), '^[[:space:]]+|[[:space:]]+$', '') end AS channel,
    /* shop */           case when lower(cast(d.shop as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$' then null else regexp_replace(cast(d.shop as string), '^[[:space:]]+|[[:space:]]+$', '') end AS shop,
    /* country_code */   case when lower(cast(d.country_code as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$' then null else regexp_replace(cast(d.country_code as string), '^[[:space:]]+|[[:space:]]+$', '') end AS country_code,
    /* country_name */   case when lower(cast(d.country_name as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$' then null else regexp_replace(cast(d.country_name as string), '^[[:space:]]+|[[:space:]]+$', '') end AS country_name,
    /* platform_sku */   case when lower(cast(d.platform_sku as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$' then null else regexp_replace(cast(d.platform_sku as string), '^[[:space:]]+|[[:space:]]+$', '') end AS platform_sku,
    /* asin */           case when lower(cast(d.asin as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$' then null else regexp_replace(cast(d.asin as string), '^[[:space:]]+|[[:space:]]+$', '') end AS asin,
    /* parent_asin */    case when lower(cast(d.parent_asin as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$' then null else regexp_replace(cast(d.parent_asin as string), '^[[:space:]]+|[[:space:]]+$', '') end AS parent_asin,
    /* sku_code */       case when lower(cast(d.sku_code as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$' then null else regexp_replace(cast(d.sku_code as string), '^[[:space:]]+|[[:space:]]+$', '') end AS sku_code,
    /* spu_code */       case when lower(cast(d.spu_code as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$' then null else regexp_replace(cast(d.spu_code as string), '^[[:space:]]+|[[:space:]]+$', '') end AS spu_code,
    /* spu_name */       case when lower(cast(d.spu_name as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$' then null else regexp_replace(cast(d.spu_name as string), '^[[:space:]]+|[[:space:]]+$', '') end AS spu_name,
    /* sku_name */       case when lower(cast(d.sku_name as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$' then null else regexp_replace(cast(d.sku_name as string), '^[[:space:]]+|[[:space:]]+$', '') end AS sku_name,
    /* brand_code */     case when lower(cast(d.sku_brand as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$' then null else regexp_replace(cast(d.sku_brand as string), '^[[:space:]]+|[[:space:]]+$', '') end AS brand_code,
    /* category_l1 */    case when lower(cast(d.category_name_level1 as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$' then null else regexp_replace(cast(d.category_name_level1 as string), '^[[:space:]]+|[[:space:]]+$', '') end AS category_name_level1,
    cast(round(cast(nullif(regexp_replace(cast(d.order_qty as string), ',', ''), '') as double)) as bigint) AS order_qty,
    cast(round(cast(nullif(regexp_replace(cast(d.sale_qty as string), ',', ''), '') as double)) as bigint) AS sale_qty,
    cast(nullif(regexp_replace(cast(d.sales_amount as string), ',', ''), '') as decimal(18, 4)) AS sales_amount,
    cast(nullif(regexp_replace(cast(d.sales_amount_usd as string), ',', ''), '') as decimal(18, 4)) AS sales_amount_usd,
    cast(round(cast(nullif(regexp_replace(cast(d.after_sale_replacement_qty as string), ',', ''), '') as double)) as bigint) AS after_sale_replacement_qty,
    cast(d.ds as date) AS ds
  FROM dws_sal_sku_statistics_td_df d
  WHERE d.ds = '${bizdate}'
) s
WHERE s.order_date IS NOT NULL
  AND s.platform IS NOT NULL
  AND s.platform_sku IS NOT NULL
GROUP BY s.order_date, s.platform, s.shop, s.country_code, s.platform_sku;
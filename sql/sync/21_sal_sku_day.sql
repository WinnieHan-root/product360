-- =============================================================================
-- 21_sal_sku_day.sql —— dws_sal_sku_statistics_td_df → sal_sku_day（销售日汇总）
-- =============================================================================
-- 清洗规则（对应 loader.ts: loadSalSkuDay）：
--   1. order_date / platform / platform_sku 任一为空 → 丢弃
--   2. 粒度 = 天 | platform | shop | country_code | platform_sku，**同一粒度多行要相加**
--   3. 累加列：sale_qty、order_qty、after_sale_replacement_qty（→ return_qty）
--   4. 金额列 sales_amount / sales_amount_usd：只累加非空值；
--      全部为 NULL 时结果保持 NULL（**不补 0**，页面显示「未接入」）
--   5. 其余维度和名称列取该粒度首行（loader 建桶时取第一行），这里用 MIN() 保持确定性
--   6. 源表没有「退货数量」列，return_qty 语义 = 售后换货数量
-- =============================================================================

TRUNCATE TABLE sal_sku_day;

WITH src AS (
  SELECT
    (SELECT max(sr_day(ds)) FROM stage_sal_sku_day) AS ds,
    sr_day(s.order_date)                            AS order_date,
    sr_text(s.platform)                             AS platform,
    sr_text(s.channel)                              AS channel,
    sr_text(s.shop)                                 AS shop,
    sr_text(s.country_code)                         AS country_code,
    sr_text(s.country_name)                         AS country_name,
    sr_text(s.platform_sku)                         AS platform_sku,
    sr_text(s.asin)                                 AS asin,
    sr_text(s.parent_asin)                          AS parent_asin,
    sr_text(s.sku_code)                             AS sku_code,
    sr_text(s.spu_code)                             AS spu_code,
    sr_text(s.spu_name)                             AS spu_name,
    sr_text(s.sku_name)                             AS sku_name,
    sr_text(s.sku_brand)                            AS brand_code,
    sr_text(s.category_name_level1)                 AS category_name_level1,
    COALESCE(sr_int(s.order_qty), 0)                AS order_qty,
    COALESCE(sr_int(s.sale_qty), 0)                 AS sale_qty,
    sr_num(s.sales_amount)                          AS sales_amount,
    sr_num(s.sales_amount_usd)                      AS sales_amount_usd,
    COALESCE(sr_int(s.after_sale_replacement_qty), 0) AS return_qty
  FROM stage_sal_sku_day s
  WHERE sr_day(s.order_date) IS NOT NULL
    AND sr_text(s.platform) IS NOT NULL
    AND sr_text(s.platform_sku) IS NOT NULL
)
INSERT INTO sal_sku_day (
  id, ds, order_date, platform, channel, shop, country_code, country_name,
  platform_sku, asin, parent_asin, sku_code, spu_code, spu_name, sku_name,
  brand_code, category_name_level1, order_qty, sale_qty, sales_amount,
  sales_amount_usd, after_sale_replacement_qty
)
SELECT
  gen_random_uuid(),
  min(ds),
  order_date, platform, min(channel), shop, country_code, min(country_name),
  platform_sku, min(asin), min(parent_asin), min(sku_code), min(spu_code),
  min(spu_name), min(sku_name), min(brand_code), min(category_name_level1),
  sum(order_qty)::int,
  sum(sale_qty)::int,
  sum(sales_amount),          -- sum() 自动忽略 NULL；全 NULL → NULL
  sum(sales_amount_usd),
  sum(return_qty)::int
FROM src
GROUP BY order_date, platform, shop, country_code, platform_sku;
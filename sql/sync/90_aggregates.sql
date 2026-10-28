-- =============================================================================
-- 90_aggregates.sql —— pd_spu 预聚合列回填（对应 loader.ts: buildAggregates）
-- =============================================================================
-- 为什么要在这里算：页面列表要展示覆盖度 / 30 天销量 / 库存 / 评分，
-- 请求期再跨表聚合会扫全表。所以同步阶段一次性算好写进 pd_spu。
--
-- coverage 口径（0-4，四件事各计 1）：
--   1. 有 SKU（sku_count > 0）
--   2. 有渠道编码（channel_count > 0，来源 sal_sku_code）
--   3. 有销量（sal_sku_day 里出现该 SPU）
--   4. 有口碑（review_count > 0）
-- 列表默认按 coverage 倒序，让数据齐全的 SPU 先出现。
-- =============================================================================

-- 1. spu_model_name：源表为空时用 pd_sku 的同名字段兜底（按 sku_code 排序取第一行）
UPDATE pd_spu s SET spu_model_name = x.spu_model_name
FROM (
  SELECT DISTINCT ON (spu_code) spu_code, spu_model_name
  FROM pd_sku
  WHERE spu_code IS NOT NULL AND spu_model_name IS NOT NULL
  ORDER BY spu_code, sku_code
) x
WHERE s.spu_code = x.spu_code
  AND (s.spu_model_name IS NULL OR s.spu_model_name = '');

-- 2. SKU 数
UPDATE pd_spu s SET sku_count = x.cnt
FROM (
  SELECT spu_code, count(*)::int AS cnt
  FROM pd_sku WHERE spu_code IS NOT NULL GROUP BY spu_code
) x
WHERE s.spu_code = x.spu_code;

-- 3. 渠道数（渠道编码表里的去重渠道数）
UPDATE pd_spu s SET channel_count = x.cnt
FROM (
  SELECT spu_code, count(DISTINCT channel)::int AS cnt
  FROM sal_sku_code WHERE spu_code IS NOT NULL GROUP BY spu_code
) x
WHERE s.spu_code = x.spu_code;

-- 4. 在售国家（销售表里去重的 country_code）
UPDATE pd_spu s SET market_countries = x.countries
FROM (
  SELECT spu_code, array_agg(DISTINCT country_code ORDER BY country_code) AS countries
  FROM sal_sku_day
  WHERE spu_code IS NOT NULL AND country_code IS NOT NULL
  GROUP BY spu_code
) x
WHERE s.spu_code = x.spu_code;

-- 5. 近 30 天销量与销售额（以销售表最大 order_date 为基准，不是 now()）
UPDATE pd_spu s SET sales_30d_qty = COALESCE(x.qty, 0), sales_30d_usd = x.usd
FROM (
  SELECT spu_code, sum(sale_qty)::int AS qty, sum(sales_amount_usd) AS usd
  FROM sal_sku_day
  WHERE spu_code IS NOT NULL
    AND order_date >= (SELECT max(order_date) FROM sal_sku_day) - INTERVAL '29 day'
  GROUP BY spu_code
) x
WHERE s.spu_code = x.spu_code;

-- 6. 库存：必须经 pd_sku 关联到 SPU（scm_stock 只有 sku_code）
UPDATE pd_spu s SET in_stock_qty = COALESCE(x.instock, 0), on_way_qty = COALESCE(x.onway, 0)
FROM (
  SELECT k.spu_code, sum(t.in_stock_qty)::int AS instock, sum(t.on_way_qty)::int AS onway
  FROM scm_stock t
  JOIN pd_sku k ON k.sku_code = t.sku_code
  WHERE k.spu_code IS NOT NULL
  GROUP BY k.spu_code
) x
WHERE s.spu_code = x.spu_code;

-- 7. 口碑：评论数 + 加权平均星级
UPDATE pd_spu s SET review_count = COALESCE(x.cnt, 0), rating_avg = x.avg
FROM (
  SELECT spu_code,
         sum(review_count)::int AS cnt,
         (sum(rating_avg * review_count) / NULLIF(sum(review_count), 0))::numeric(4,3) AS avg
  FROM voc_review_day
  GROUP BY spu_code
) x
WHERE s.spu_code = x.spu_code;

-- 8. 是否有销量
UPDATE pd_spu s SET has_sales = TRUE
WHERE EXISTS (SELECT 1 FROM sal_sku_day d WHERE d.spu_code = s.spu_code);

-- 9. 覆盖度（必须最后算，上面 2/3/7/8 都已回填）
UPDATE pd_spu SET coverage =
  (CASE WHEN sku_count > 0 THEN 1 ELSE 0 END) +
  (CASE WHEN channel_count > 0 THEN 1 ELSE 0 END) +
  (CASE WHEN has_sales THEN 1 ELSE 0 END) +
  (CASE WHEN review_count > 0 THEN 1 ELSE 0 END);

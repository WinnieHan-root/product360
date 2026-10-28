-- =============================================================================
-- 11_pd_spu.sql —— dim_pd_spu_info_df → p360_pd_spu（含 0-4 覆盖度预聚合）
-- =============================================================================
-- 这是整条链路里唯一「跨表」的任务，所以放在最后跑（依赖下面 5 张 p360_* 中间表）：
--   p360_pd_sku / p360_sal_sku_code / p360_sal_sku_day / p360_scm_stock / p360_voc_review_day
--
-- 清洗规则（对齐 loader.ts: loadSpu / modelNameOf / buildAggregates）：
--   1. spu_code 为空 → 丢弃；同 spu_code 取 update_time 最新的一条
--   2. spu_name 为空 → 回落成 spu_code（PG 列 NOT NULL）
--   3. spu_state 为空 → 1；spu_state_desc 为空 → '待上架'
--   4. spu_model_name = model_info[0].model_name，为空再取 [0].modelName，
--      仍为空则用 p360_pd_sku 里同 SPU 的 spu_model_name 兜底
--   5. tag_info / series_info / model_info 非法 JSON → NULL
--
-- 覆盖度 coverage（0-4，四项各计 1；列表默认按它倒序）：
--   ① 有 SKU（sku_count > 0）        ② 有渠道编码（channel_count > 0）
--   ③ 有销量（sal_sku_day 里出现过）  ④ 有口碑（review_count > 0）
-- =============================================================================

INSERT INTO p360_pd_spu
SELECT
  s.spu_code,
  s.ds,
  s.company_code,
  coalesce(s.spu_name, s.spu_code) AS spu_name,
  s.spu_name_en,
  s.spu_alias_name,
  s.spu_image,
  s.spu_level_new,
  coalesce(s.spu_state, 1)         AS spu_state,
  coalesce(s.spu_state_desc, '待上架') AS spu_state_desc,
  coalesce(s.spu_model_name, km.spu_model_name) AS spu_model_name,
  s.spu_product_type_desc,
  s.spu_desc,
  s.selling_point,
  s.product_line_code,
  s.product_line_name,
  s.gtm_code,
  s.gtm_name,
  s.product_leader_code,
  s.product_leader_name,
  s.planner_name,
  s.brand_code,
  s.suggest_currency,
  s.suggest_price,
  s.listing_time,
  s.is_new_spu,
  s.voc_model,
  s.category_code,
  s.category_name,
  s.category_code_level1,
  s.category_name_level1,
  s.category_code_level2,
  s.category_name_level2,
  s.category_code_level3,
  s.category_name_level3,
  s.category_code_level4,
  s.category_name_level4,
  s.category_code_level5,
  s.category_name_level5,
  s.category_tag_name,
  s.is_electrical_desc,
  s.class_tag_name,
  s.sence_tag_name,
  s.fmcg_tag_name,
  s.iot_tag_name,
  s.tag_info,
  s.series_info,
  s.model_info,
  coalesce(s.deleted, 0) AS deleted,
  s.update_time,
  -- 预聚合列（顺序必须与 01_sr_tables.sql 的 DDL 一致）
  (case when coalesce(k.cnt, 0) > 0 then 1 else 0 end
 + case when coalesce(ch.cnt, 0) > 0 then 1 else 0 end
 + case when coalesce(sa.has_sales, false) then 1 else 0 end
 + case when coalesce(rv.cnt, 0) > 0 then 1 else 0 end) AS coverage,
  coalesce(k.cnt, 0)     AS sku_count,
  coalesce(ch.cnt, 0)    AS channel_count,
  coalesce(sa.has_sales, false) AS has_sales,
  coalesce(mc.countries, '{}')  AS market_countries,
  coalesce(sa.qty, 0)    AS sales_30d_qty,
  sa.usd                 AS sales_30d_usd,
  coalesce(st.instock, 0) AS in_stock_qty,
  coalesce(st.onway, 0)   AS on_way_qty,
  coalesce(rv.cnt, 0)     AS review_count,
  rv.avg_rating           AS rating_avg
FROM (
  SELECT
    row_number() OVER (PARTITION BY src.spu_code ORDER BY src.update_time DESC, src.spu_code) AS rn,
    src.*
  FROM (
    SELECT
      cast(p.ds as date) AS ds,
      case when lower(cast(p.company_code as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$'
           then null else regexp_replace(cast(p.company_code as string), '^[[:space:]]+|[[:space:]]+$', '') end AS company_code,
      case when lower(cast(p.spu_code as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$'
           then null else regexp_replace(cast(p.spu_code as string), '^[[:space:]]+|[[:space:]]+$', '') end AS spu_code,
      case when lower(cast(p.spu_name as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$'
           then null else regexp_replace(cast(p.spu_name as string), '^[[:space:]]+|[[:space:]]+$', '') end AS spu_name,
      case when lower(cast(p.spu_name_en as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$'
           then null else regexp_replace(cast(p.spu_name_en as string), '^[[:space:]]+|[[:space:]]+$', '') end AS spu_name_en,
      case when lower(cast(p.spu_alias_name as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$'
           then null else regexp_replace(cast(p.spu_alias_name as string), '^[[:space:]]+|[[:space:]]+$', '') end AS spu_alias_name,
      case when lower(cast(p.spu_image as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$'
           then null else regexp_replace(cast(p.spu_image as string), '^[[:space:]]+|[[:space:]]+$', '') end AS spu_image,
      case when lower(cast(p.spu_level_new as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$'
           then null else regexp_replace(cast(p.spu_level_new as string), '^[[:space:]]+|[[:space:]]+$', '') end AS spu_level_new,
      cast(round(cast(nullif(regexp_replace(cast(p.spu_state as string), ',', ''), '') as double)) as bigint) AS spu_state,
      case when lower(cast(p.spu_state_desc as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$'
           then null else regexp_replace(cast(p.spu_state_desc as string), '^[[:space:]]+|[[:space:]]+$', '') end AS spu_state_desc,
      -- model_info 是 [{model_code, model_name, model_remark}]，取首元素
      coalesce(
        case when lower(cast(get_json_string(parse_json(cast(p.model_info as string)), '$[0].model_name') as string))
                  rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$'
             then null
             else regexp_replace(cast(get_json_string(parse_json(cast(p.model_info as string)), '$[0].model_name') as string),
                                 '^[[:space:]]+|[[:space:]]+$', '') end,
        case when lower(cast(get_json_string(parse_json(cast(p.model_info as string)), '$[0].modelName') as string))
                  rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$'
             then null
             else regexp_replace(cast(get_json_string(parse_json(cast(p.model_info as string)), '$[0].modelName') as string),
                                 '^[[:space:]]+|[[:space:]]+$', '') end
      ) AS spu_model_name,
      case when lower(cast(p.spu_product_type_desc as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$'
           then null else regexp_replace(cast(p.spu_product_type_desc as string), '^[[:space:]]+|[[:space:]]+$', '') end AS spu_product_type_desc,
      case when lower(cast(p.spu_desc as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$'
           then null else regexp_replace(cast(p.spu_desc as string), '^[[:space:]]+|[[:space:]]+$', '') end AS spu_desc,
      -- 注意：卖点里可能有换行，必须用 regexp_replace 裁 [[:space:]]，不能用 trim()
      case when lower(cast(p.selling_point as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$'
           then null else regexp_replace(cast(p.selling_point as string), '^[[:space:]]+|[[:space:]]+$', '') end AS selling_point,
      case when lower(cast(p.product_line_code as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$'
           then null else regexp_replace(cast(p.product_line_code as string), '^[[:space:]]+|[[:space:]]+$', '') end AS product_line_code,
      case when lower(cast(p.product_line_name as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$'
           then null else regexp_replace(cast(p.product_line_name as string), '^[[:space:]]+|[[:space:]]+$', '') end AS product_line_name,
      case when lower(cast(p.gtm_code as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$'
           then null else regexp_replace(cast(p.gtm_code as string), '^[[:space:]]+|[[:space:]]+$', '') end AS gtm_code,
      case when lower(cast(p.gtm_name as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$'
           then null else regexp_replace(cast(p.gtm_name as string), '^[[:space:]]+|[[:space:]]+$', '') end AS gtm_name,
      case when lower(cast(p.product_leader_code as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$'
           then null else regexp_replace(cast(p.product_leader_code as string), '^[[:space:]]+|[[:space:]]+$', '') end AS product_leader_code,
      case when lower(cast(p.product_leader_name as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$'
           then null else regexp_replace(cast(p.product_leader_name as string), '^[[:space:]]+|[[:space:]]+$', '') end AS product_leader_name,
      case when lower(cast(p.planner_name as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$'
           then null else regexp_replace(cast(p.planner_name as string), '^[[:space:]]+|[[:space:]]+$', '') end AS planner_name,
      case when lower(cast(p.brand_code as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$'
           then null else regexp_replace(cast(p.brand_code as string), '^[[:space:]]+|[[:space:]]+$', '') end AS brand_code,
      case when lower(cast(p.suggest_currency as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$'
           then null else regexp_replace(cast(p.suggest_currency as string), '^[[:space:]]+|[[:space:]]+$', '') end AS suggest_currency,
      cast(nullif(regexp_replace(cast(p.suggest_price as string), ',', ''), '') as decimal(18, 4)) AS suggest_price,
      cast(nullif(left(cast(p.listing_time as string), 19), '') as datetime) AS listing_time,
      cast(round(cast(nullif(regexp_replace(cast(p.is_new_spu as string), ',', ''), '') as double)) as bigint) AS is_new_spu,
      case when lower(cast(p.voc_model as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$'
           then null else regexp_replace(cast(p.voc_model as string), '^[[:space:]]+|[[:space:]]+$', '') end AS voc_model,
      case when lower(cast(p.category_code as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$'
           then null else regexp_replace(cast(p.category_code as string), '^[[:space:]]+|[[:space:]]+$', '') end AS category_code,
      case when lower(cast(p.category_name as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$'
           then null else regexp_replace(cast(p.category_name as string), '^[[:space:]]+|[[:space:]]+$', '') end AS category_name,
      case when lower(cast(p.category_code_level1 as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$'
           then null else regexp_replace(cast(p.category_code_level1 as string), '^[[:space:]]+|[[:space:]]+$', '') end AS category_code_level1,
      case when lower(cast(p.category_name_level1 as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$'
           then null else regexp_replace(cast(p.category_name_level1 as string), '^[[:space:]]+|[[:space:]]+$', '') end AS category_name_level1,
      case when lower(cast(p.category_code_level2 as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$'
           then null else regexp_replace(cast(p.category_code_level2 as string), '^[[:space:]]+|[[:space:]]+$', '') end AS category_code_level2,
      case when lower(cast(p.category_name_level2 as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$'
           then null else regexp_replace(cast(p.category_name_level2 as string), '^[[:space:]]+|[[:space:]]+$', '') end AS category_name_level2,
      case when lower(cast(p.category_code_level3 as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$'
           then null else regexp_replace(cast(p.category_code_level3 as string), '^[[:space:]]+|[[:space:]]+$', '') end AS category_code_level3,
      case when lower(cast(p.category_name_level3 as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$'
           then null else regexp_replace(cast(p.category_name_level3 as string), '^[[:space:]]+|[[:space:]]+$', '') end AS category_name_level3,
      case when lower(cast(p.category_code_level4 as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$'
           then null else regexp_replace(cast(p.category_code_level4 as string), '^[[:space:]]+|[[:space:]]+$', '') end AS category_code_level4,
      case when lower(cast(p.category_name_level4 as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$'
           then null else regexp_replace(cast(p.category_name_level4 as string), '^[[:space:]]+|[[:space:]]+$', '') end AS category_name_level4,
      case when lower(cast(p.category_code_level5 as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$'
           then null else regexp_replace(cast(p.category_code_level5 as string), '^[[:space:]]+|[[:space:]]+$', '') end AS category_code_level5,
      case when lower(cast(p.category_name_level5 as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$'
           then null else regexp_replace(cast(p.category_name_level5 as string), '^[[:space:]]+|[[:space:]]+$', '') end AS category_name_level5,
      case when lower(cast(p.category_tag_name as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$'
           then null else regexp_replace(cast(p.category_tag_name as string), '^[[:space:]]+|[[:space:]]+$', '') end AS category_tag_name,
      case when lower(cast(p.is_electrical_desc as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$'
           then null else regexp_replace(cast(p.is_electrical_desc as string), '^[[:space:]]+|[[:space:]]+$', '') end AS is_electrical_desc,
      case when lower(cast(p.class_tag_name as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$'
           then null else regexp_replace(cast(p.class_tag_name as string), '^[[:space:]]+|[[:space:]]+$', '') end AS class_tag_name,
      case when lower(cast(p.sence_tag_name as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$'
           then null else regexp_replace(cast(p.sence_tag_name as string), '^[[:space:]]+|[[:space:]]+$', '') end AS sence_tag_name,
      case when lower(cast(p.fmcg_tag_name as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$'
           then null else regexp_replace(cast(p.fmcg_tag_name as string), '^[[:space:]]+|[[:space:]]+$', '') end AS fmcg_tag_name,
      case when lower(cast(p.iot_tag_name as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$'
           then null else regexp_replace(cast(p.iot_tag_name as string), '^[[:space:]]+|[[:space:]]+$', '') end AS iot_tag_name,
      parse_json(cast(p.tag_info as string))    AS tag_info,
      parse_json(cast(p.series_info as string)) AS series_info,
      parse_json(cast(p.model_info as string))  AS model_info,
      cast(round(cast(nullif(regexp_replace(cast(p.deleted as string), ',', ''), '') as double)) as bigint) AS deleted,
      cast(nullif(left(cast(p.update_time as string), 19), '') as datetime) AS update_time
    FROM dim_pd_spu_info_df p
    WHERE p.ds = '${bizdate}'
  ) src
  WHERE src.spu_code IS NOT NULL
) s
-- ① SKU 数
LEFT JOIN (
  SELECT spu_code, count(*) AS cnt FROM p360_pd_sku WHERE spu_code IS NOT NULL GROUP BY spu_code
) k ON k.spu_code = s.spu_code
-- ①' model 兜底：同 SPU 里按 sku_code 取第一个非空 spu_model_name
LEFT JOIN (
  SELECT spu_code, spu_model_name FROM (
    SELECT m.spu_code, m.spu_model_name,
           row_number() OVER (PARTITION BY m.spu_code ORDER BY m.sku_code) AS rn
    FROM p360_pd_sku m
    WHERE m.spu_code IS NOT NULL AND m.spu_model_name IS NOT NULL
  ) x WHERE x.rn = 1
) km ON km.spu_code = s.spu_code
-- ② 渠道数
LEFT JOIN (
  SELECT spu_code, count(DISTINCT channel) AS cnt
  FROM p360_sal_sku_code WHERE spu_code IS NOT NULL GROUP BY spu_code
) ch ON ch.spu_code = s.spu_code
-- ③ 销量：以销售表最大 order_date 为基准的 30 天窗口（不是 now()）
LEFT JOIN (
  SELECT
    d.spu_code,
    sum(d.sale_qty) AS qty,
    sum(d.sales_amount_usd) AS usd,
    true AS has_sales
  FROM p360_sal_sku_day d
  CROSS JOIN (SELECT date_sub(max(order_date), 29) AS d30 FROM p360_sal_sku_day) w
  WHERE d.spu_code IS NOT NULL
    AND d.order_date >= w.d30
  GROUP BY d.spu_code
) sa ON sa.spu_code = s.spu_code
-- ③' 在售国家 → PG 数组字面量 {US,DE}
LEFT JOIN (
  SELECT spu_code, concat('{', array_join(array_sort(collect_set(country_code)), ','), '}') AS countries
  FROM p360_sal_sku_day
  WHERE spu_code IS NOT NULL AND country_code IS NOT NULL
  GROUP BY spu_code
) mc ON mc.spu_code = s.spu_code
-- ④ 库存：必须经 p360_pd_sku 关联（库存表只有 sku_code）
LEFT JOIN (
  SELECT k2.spu_code, sum(t.in_stock_qty) AS instock, sum(t.on_way_qty) AS onway
  FROM p360_scm_stock t
  JOIN p360_pd_sku k2 ON k2.sku_code = t.sku_code
  WHERE k2.spu_code IS NOT NULL
  GROUP BY k2.spu_code
) st ON st.spu_code = s.spu_code
-- ⑤ 口碑：评论数 + 加权平均星级
LEFT JOIN (
  SELECT spu_code,
         sum(review_count) AS cnt,
         round(sum(rating_avg * review_count) / nullif(sum(review_count), 0), 3) AS avg_rating
  FROM p360_voc_review_day
  GROUP BY spu_code
) rv ON rv.spu_code = s.spu_code
WHERE s.rn = 1;
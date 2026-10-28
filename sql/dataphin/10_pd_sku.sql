-- =============================================================================
-- 10_pd_sku.sql —— dim_pd_sku_info_df → p360_pd_sku
-- =============================================================================
-- 清洗规则（与 apps/api/src/sync/loader.ts: loadSku 逐条对齐）：
--   1. sku_code 为空 → 丢弃
--   2. 同一 sku_code 多行 → 取 update_time 最新的一条
--      （loader 在 CSV 上是「文件里最后一行覆盖」，SR 没有行序，
--        改用 update_time 排序；样例数据实测结果完全一致）
--   3. sku_name 为空 → 回落成 sku_code（PG 列 NOT NULL）
--   4. deleted 为空 → 0
--   5. 数字列非法值 → NULL（**不补 0**，页面据此显示「未接入」）
--   6. attr_info / sensitive_info 非法 JSON → NULL
--
-- 空值归一化表达式（全文统一，等价于 loader 的 text()）：
--   case when lower(cast(x as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$'
--        then null
--        else regexp_replace(cast(x as string), '^[[:space:]]+|[[:space:]]+$', '') end
--   覆盖：''、空格、换行、'None'、'null'、'NaN'、'n/a'、'-'（大小写不敏感）
--
-- 分区：ds 为 string 'YYYY-MM-DD' 时用 '${bizdate}'；
--       若 ds 是 int yyyyMMdd，把条件改成 ds = ${bizdate}（去掉引号）。
-- =============================================================================

INSERT INTO p360_pd_sku
SELECT
  c.sku_code,
  c.ds,
  c.sku_code_new,
  c.scm_sku_code,
  coalesce(c.sku_name, c.sku_code) AS sku_name,
  c.sku_name_en,
  c.sku_image_url,
  c.sku_state,
  c.sku_state_desc,
  c.brand_code,
  c.brand_name,
  c.suggest_currency,
  c.suggest_price,
  c.spu_code,
  c.spu_name,
  c.spu_model_name,
  c.spec_product_length,
  c.spec_product_width,
  c.spec_product_height,
  c.spec_product_weight,
  c.spec_product_net_weight,
  c.spec_carton_length,
  c.spec_carton_width,
  c.spec_carton_height,
  c.spec_carton_weight,
  c.spec_carton_num,
  c.spec_material,
  c.sku_color,
  c.sku_size,
  c.sku_pack,
  c.listing_time,
  c.attr_info,
  c.sensitive_info,
  coalesce(c.deleted, 0) AS deleted,
  c.update_time
FROM (
  SELECT
    src.*,
    row_number() OVER (PARTITION BY src.sku_code ORDER BY src.update_time DESC, src.sku_code) AS rn
  FROM (
    SELECT
      cast(s.ds as date) AS ds,
      case when lower(cast(s.sku_code as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$'
           then null else regexp_replace(cast(s.sku_code as string), '^[[:space:]]+|[[:space:]]+$', '') end AS sku_code,
      case when lower(cast(s.sku_code_new as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$'
           then null else regexp_replace(cast(s.sku_code_new as string), '^[[:space:]]+|[[:space:]]+$', '') end AS sku_code_new,
      case when lower(cast(s.scm_sku_code as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$'
           then null else regexp_replace(cast(s.scm_sku_code as string), '^[[:space:]]+|[[:space:]]+$', '') end AS scm_sku_code,
      case when lower(cast(s.sku_name as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$'
           then null else regexp_replace(cast(s.sku_name as string), '^[[:space:]]+|[[:space:]]+$', '') end AS sku_name,
      case when lower(cast(s.sku_name_en as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$'
           then null else regexp_replace(cast(s.sku_name_en as string), '^[[:space:]]+|[[:space:]]+$', '') end AS sku_name_en,
      case when lower(cast(s.sku_image_url as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$'
           then null else regexp_replace(cast(s.sku_image_url as string), '^[[:space:]]+|[[:space:]]+$', '') end AS sku_image_url,
      cast(round(cast(nullif(regexp_replace(cast(s.sku_state as string), ',', ''), '') as double)) as bigint) AS sku_state,
      case when lower(cast(s.sku_state_desc as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$'
           then null else regexp_replace(cast(s.sku_state_desc as string), '^[[:space:]]+|[[:space:]]+$', '') end AS sku_state_desc,
      case when lower(cast(s.brand_code as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$'
           then null else regexp_replace(cast(s.brand_code as string), '^[[:space:]]+|[[:space:]]+$', '') end AS brand_code,
      case when lower(cast(s.brand_name as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$'
           then null else regexp_replace(cast(s.brand_name as string), '^[[:space:]]+|[[:space:]]+$', '') end AS brand_name,
      case when lower(cast(s.suggest_currency as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$'
           then null else regexp_replace(cast(s.suggest_currency as string), '^[[:space:]]+|[[:space:]]+$', '') end AS suggest_currency,
      cast(nullif(regexp_replace(cast(s.suggest_price as string), ',', ''), '') as decimal(18, 4)) AS suggest_price,
      case when lower(cast(s.spu_code as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$'
           then null else regexp_replace(cast(s.spu_code as string), '^[[:space:]]+|[[:space:]]+$', '') end AS spu_code,
      case when lower(cast(s.spu_name as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$'
           then null else regexp_replace(cast(s.spu_name as string), '^[[:space:]]+|[[:space:]]+$', '') end AS spu_name,
      case when lower(cast(s.spu_model_name as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$'
           then null else regexp_replace(cast(s.spu_model_name as string), '^[[:space:]]+|[[:space:]]+$', '') end AS spu_model_name,
      cast(nullif(regexp_replace(cast(s.spec_product_length as string), ',', ''), '') as decimal(18, 4)) AS spec_product_length,
      cast(nullif(regexp_replace(cast(s.spec_product_width as string), ',', ''), '') as decimal(18, 4)) AS spec_product_width,
      cast(nullif(regexp_replace(cast(s.spec_product_height as string), ',', ''), '') as decimal(18, 4)) AS spec_product_height,
      cast(nullif(regexp_replace(cast(s.spec_product_weight as string), ',', ''), '') as decimal(18, 4)) AS spec_product_weight,
      cast(nullif(regexp_replace(cast(s.spec_product_net_weight as string), ',', ''), '') as decimal(18, 4)) AS spec_product_net_weight,
      cast(nullif(regexp_replace(cast(s.spec_carton_length as string), ',', ''), '') as decimal(18, 4)) AS spec_carton_length,
      cast(nullif(regexp_replace(cast(s.spec_carton_width as string), ',', ''), '') as decimal(18, 4)) AS spec_carton_width,
      cast(nullif(regexp_replace(cast(s.spec_carton_height as string), ',', ''), '') as decimal(18, 4)) AS spec_carton_height,
      cast(nullif(regexp_replace(cast(s.spec_carton_weight as string), ',', ''), '') as decimal(18, 4)) AS spec_carton_weight,
      cast(round(cast(nullif(regexp_replace(cast(s.spec_carton_num as string), ',', ''), '') as double)) as bigint) AS spec_carton_num,
      case when lower(cast(s.spec_material as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$'
           then null else regexp_replace(cast(s.spec_material as string), '^[[:space:]]+|[[:space:]]+$', '') end AS spec_material,
      case when lower(cast(s.sku_color as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$'
           then null else regexp_replace(cast(s.sku_color as string), '^[[:space:]]+|[[:space:]]+$', '') end AS sku_color,
      case when lower(cast(s.sku_size as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$'
           then null else regexp_replace(cast(s.sku_size as string), '^[[:space:]]+|[[:space:]]+$', '') end AS sku_size,
      case when lower(cast(s.sku_pack as string)) rlike '^[[:space:]]*(none|null|nan|n/a|-)?[[:space:]]*$'
           then null else regexp_replace(cast(s.sku_pack as string), '^[[:space:]]+|[[:space:]]+$', '') end AS sku_pack,
      cast(nullif(left(cast(s.listing_time as string), 19), '') as datetime) AS listing_time,
      parse_json(cast(s.attr_info as string))      AS attr_info,
      parse_json(cast(s.sensitive_info as string)) AS sensitive_info,
      cast(round(cast(nullif(regexp_replace(cast(s.deleted as string), ',', ''), '') as double)) as bigint) AS deleted,
      cast(nullif(left(cast(s.update_time as string), 19), '') as datetime) AS update_time
    FROM dim_pd_sku_info_df s
    WHERE s.ds = '${bizdate}'
  ) src
  WHERE src.sku_code IS NOT NULL
) c
WHERE c.rn = 1;
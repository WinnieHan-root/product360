-- =============================================================================
-- 00_functions.sql —— 清洗函数（与 apps/api/src/sync/source.ts 的语义一一对应）
-- =============================================================================
-- loader 里的 text()/integer()/decimal()/dayDate()/timestamp()/json() 是整条
-- ETL 的清洗契约，SQL 版必须完全等价，否则 PG 里的数值会和 CSV 加载版不一致。
--
-- 关键约定（容易漏）：
--   1. '' 以及 none / null / nan / n/a / -（大小写不敏感）都视为 NULL
--   2. 数字串里的千分位逗号要去掉（"1,234" → 1234）
--   3. 无法解析的数字 → NULL（**不是 0**，页面据此显示「未接入」）
--   4. 日期只取前 10 位 YYYY-MM-DD；无时区的时间按 UTC 解释
-- =============================================================================

BEGIN;

-- JS 的 trim() 会裁掉空格 / \n / \r / \t / 全角空格；PG 的 btrim() 默认只裁半角空格
CREATE OR REPLACE FUNCTION sr_rstrip(v text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(v, '[[:space:]\u00a0\u3000]+$', '')
$$;

CREATE OR REPLACE FUNCTION sr_trim(v text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(sr_rstrip(v), '^[[:space:]\u00a0\u3000]+', '')
$$;

CREATE OR REPLACE FUNCTION sr_text(v text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN v IS NULL THEN NULL
    WHEN sr_trim(v) = '' THEN NULL
    WHEN lower(sr_trim(v)) IN ('none', 'null', 'nan', 'n/a', '-') THEN NULL
    ELSE sr_trim(v)
  END
$$;

COMMENT ON FUNCTION sr_text(text) IS '等价于 loader 的 text()：空值与占位符统一转 NULL';

CREATE OR REPLACE FUNCTION sr_num(v text) RETURNS numeric
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN sr_text(v) IS NULL THEN NULL
    WHEN replace(sr_text(v), ',', '') ~ '^[+-]?([0-9]+(\.[0-9]*)?|\.[0-9]+)$'
      THEN replace(sr_text(v), ',', '')::numeric
    ELSE NULL
  END
$$;

COMMENT ON FUNCTION sr_num(text) IS '等价于 loader 的 decimal()：去千分位，非法值转 NULL';

CREATE OR REPLACE FUNCTION sr_int(v text) RETURNS integer
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN sr_num(v) IS NULL THEN NULL
    ELSE round(sr_num(v))::integer   -- 注意：PG 的 round 是四舍五入远离 0
  END
$$;

COMMENT ON FUNCTION sr_int(text) IS '等价于 loader 的 integer()：数字取整，非法值转 NULL';

CREATE OR REPLACE FUNCTION sr_day(v text) RETURNS date
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN sr_text(v) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
      THEN substring(sr_text(v) from 1 for 10)::date
    ELSE NULL
  END
$$;

COMMENT ON FUNCTION sr_day(text) IS '等价于 loader 的 dayDate()：只认前 10 位 YYYY-MM-DD';

CREATE OR REPLACE FUNCTION sr_ts(v text) RETURNS timestamptz
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN sr_text(v) IS NULL THEN NULL
    WHEN sr_text(v) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[ T][0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]+)?)?$'
      THEN replace(sr_text(v), ' ', 'T')::timestamptz      -- 无时区 → 按 UTC
    WHEN sr_text(v) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      THEN sr_text(v)::date::timestamptz                   -- 纯日期 → 当天 00:00 UTC
    ELSE NULL
  END
$$;

COMMENT ON FUNCTION sr_ts(text) IS '等价于 loader 的 timestamp()：按 UTC 解释无时区时间';

-- JSON 列：非法 JSON 或非数组/非对象 → NULL（loader 的 json() 返回 null）
CREATE OR REPLACE FUNCTION sr_json(v text) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  raw text := sr_text(v);
BEGIN
  IF raw IS NULL THEN RETURN NULL; END IF;
  BEGIN
    RETURN raw::jsonb;
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;
END
$$;

COMMENT ON FUNCTION sr_json(text) IS '等价于 loader 的 json()：解析失败转 NULL';

-- 一次同步的批次 id（同一事务内复用，写入 sync_batch 供 asOf 使用）
CREATE OR REPLACE FUNCTION sr_batch_id() RETURNS text
LANGUAGE sql VOLATILE AS $$ SELECT gen_random_uuid()::text $$;

COMMIT;

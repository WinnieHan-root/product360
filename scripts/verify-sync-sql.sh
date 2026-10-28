#!/usr/bin/env bash
# =============================================================================
# verify-sync-sql.sh —— 证明 sql/sync 下的清洗 SQL 与 TS loader（pnpm db:sync）等价
# =============================================================================
# 做法：
#   1. 建一个临时库 p360sync_verify，用 schema.prisma 建目标表结构
#   2. 把 docs/sample_exports 的 CSV 投影进 staging 表（模拟 StarRocks 导出）
#   3. 顺序执行 sql/sync/00 → 99
#   4. 与「已由 pnpm db:sync 灌好的库」逐表逐列对比（排除 id uuid 列）
#
# 前置：本地 postgres 容器在跑（docker compose up -d postgres），且已有同步好的库。
# 用法：bash scripts/verify-sync-sql.sh [参考库名] [验证库名]
# =============================================================================
set -euo pipefail

REF_DB="${1:-product360}"
DB="${2:-p360sync_verify}"
CONTAINER="${PG_CONTAINER:-product360-postgres}"
PGUSER="${PGUSER:-product360}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TABLES=(pd_spu pd_sku sal_sku_code sal_sku_day scm_stock voc_review_day voc_nps_sentiment voc_nps_tag voc_ticket_topic voc_competitor)
SCHEMA_TABLES=("${TABLES[@]}" sync_batch)

psql_exec() { docker exec -i "$CONTAINER" psql -U "$PGUSER" -d "$1" -v ON_ERROR_STOP=1 "${@:2}"; }
log() { printf '\n== %s\n' "$*"; }

log "0. 重建验证库 $DB"
psql_exec postgres -q -c "DROP DATABASE IF EXISTS $DB;" -c "CREATE DATABASE $DB;"

log "1. 目标表结构（照搬参考库的 DDL，避免 prisma db push 反复确认）"
docker exec "$CONTAINER" bash -c "pg_dump -U $PGUSER -d $REF_DB --schema-only \
  $(printf -- '-t %s ' "${SCHEMA_TABLES[@]}") | psql -U $PGUSER -d $DB -q"

log "2. staging 表 + 灌入样例 CSV"
python3 "$ROOT/sql/sync/gen_stage.py" > "$ROOT/sql/sync/01_stage_ddl.sql"
python3 "$ROOT/sql/sync/gen_stage.py" --load-sql /tmp/stage/load.sql > /dev/null
psql_exec "$DB" -q -f - < "$ROOT/sql/sync/01_stage_ddl.sql"

rm -rf /tmp/stage && mkdir -p /tmp/stage
python3 - "$ROOT" <<'PY'
import re, subprocess, sys, pathlib
root = pathlib.Path(sys.argv[1])
ddl = (root / "sql/sync/01_stage_ddl.sql").read_text()
src = {
 "stage_pd_spu": "dim_pd_spu_info_df", "stage_pd_sku": "dim_pd_sku_info_df",
 "stage_sal_sku_code": "dim_sal_sku_info_df", "stage_sal_sku_day": "dws_sal_sku_statistics_td_df",
 "stage_scm_stock": "dwb_scm_stock_channel_df", "stage_voc_nps": "dws_cs_voc_nps_review_df",
 "stage_voc_ticket": "dwb_cs_voc_record_channel_hf",
}
for m in re.finditer(r"CREATE TABLE (\w+) \((.*?)\n\);", ddl, re.S):
    table, body = m.group(1), m.group(2)
    cols = [c.strip().split()[0] for c in body.split(",") if c.strip() and not c.strip().startswith("--")]
    cols = [c for c in cols if c != "_row_no"]
    subprocess.run([sys.executable, str(root / "sql/sync/project_csv.py"), src[table],
                    f"/tmp/stage/{table}.csv", *cols], check=True)
PY
docker cp /tmp/stage/. "$CONTAINER:/tmp/stage/" > /dev/null
psql_exec "$DB" -q -f /tmp/stage/load.sql

log "3. 执行清洗 SQL（00 → 99）"
for f in 00_functions 10_pd_sku 11_pd_spu 20_sal_sku_code 21_sal_sku_day 22_scm_stock \
         30_voc_review_day 31_voc_nps_sentiment 32_voc_nps_tag 33_voc_ticket_topic \
         34_voc_competitor 90_aggregates 95_sync_batch; do
  docker cp "$ROOT/sql/sync/$f.sql" "$CONTAINER:/tmp/$f.sql" > /dev/null
  psql_exec "$DB" -q -f "/tmp/$f.sql"
  echo "   ok  $f.sql"
done

log "4. 与 $REF_DB 逐表逐列比对（排除 id）"
fail=0
for t in "${TABLES[@]}"; do
  cols=$(psql_exec "$DB" -tAc "select string_agg(quote_ident(column_name), ',' order by ordinal_position)
    from information_schema.columns where table_name='$t' and column_name<>'id'")
  for db in "$REF_DB" "$DB"; do
    psql_exec "$db" -q -c "\copy (select $cols from $t order by $cols) to '/tmp/cmp_${db}_${t}.csv' csv"
  done
  h1=$(docker exec "$CONTAINER" md5sum "/tmp/cmp_${REF_DB}_${t}.csv" | cut -d' ' -f1)
  h2=$(docker exec "$CONTAINER" md5sum "/tmp/cmp_${DB}_${t}.csv" | cut -d' ' -f1)
  n=$(psql_exec "$DB" -tAc "select count(*) from $t")
  if [ "$h1" = "$h2" ]; then
    printf '   ✅ %-20s %s 行 与 %s 完全一致\n' "$t" "$n" "$REF_DB"
  else
    printf '   ❌ %-20s %s 行 与 %s 不一致\n' "$t" "$n" "$REF_DB"
    fail=1
  fi
done

log "5. 业务口径抽查"
psql_exec "$DB" -q -f - < "$ROOT/sql/sync/99_verify.sql"

if [ "$fail" -ne 0 ]; then
  echo; echo "结果：存在差异，清洗 SQL 与 loader 不等价"; exit 1
fi
echo; echo "结果：10 张表全部与 TS loader 输出一致"
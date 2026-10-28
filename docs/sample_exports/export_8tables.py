#!/usr/bin/env python3
"""导出 8 张表的样例数据，每表 1000 行，ds=2026-10-26"""
import os, pymysql, csv

DS = "2026-10-26"
TABLES = [
    "dim_pd_spu_info_df",
    "dim_pd_sku_info_df",
    "dws_sal_sku_statistics_td_df",
    "dwb_scm_stock_channel_df",
    "dim_sal_sku_info_df",
    "dwb_cs_voc_record_channel_hf",
    "dwb_sal_return_sku_df",
    "dws_cs_voc_nps_review_df",
]
OUTDIR = "/tmp/sample_exports"
os.makedirs(OUTDIR, exist_ok=True)

c = pymysql.connect(
    host=os.environ["SR_HOST"],
    port=int(os.environ["SR_PORT"]),
    user=os.environ["SR_USER"],
    password=os.environ["SR_PASSWORD"],
    database="lute_edw",
    charset="utf8mb4",
)

for tbl in TABLES:
    print(f"Exporting {tbl}...")
    sql = f"SELECT * FROM {tbl} WHERE ds=%s LIMIT 1000"
    cur = c.cursor()
    cur.execute(sql, (DS,))
    rows = cur.fetchall()
    cols = [d[0] for d in cur.description]
    
    out_path = os.path.join(OUTDIR, f"{tbl}.csv")
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(cols)
        w.writerows(rows)
    print(f"  → {out_path} ({len(rows)} rows)")

c.close()
print("Done.")
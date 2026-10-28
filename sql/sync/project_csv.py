#!/usr/bin/env python3
"""把 docs/sample_exports 的 CSV 投影成 staging 表需要的列，供 COPY 使用。

StarRocks 侧不需要这个脚本（直接从表导出需要的列即可）；
它只是为了在本地用样例 CSV 复现「原始数据已落到 staging 表」这一状态。

用法：
  python3 sql/sync/project_csv.py <源表名> <输出csv> <列1> <列2> ...
"""
import csv
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EXPORTS = ROOT / "docs" / "sample_exports"
EMPTY = {"", "none", "null", "nan", "n/a", "-"}


def read_variants(name: str):
    """base + _breast_pump 两份导出，按 loader 的顺序拼接。"""
    header = None
    rows = []
    for suffix in ("", "_breast_pump"):
        path = EXPORTS / f"{name}{suffix}.csv"
        if not path.exists():
            continue
        with path.open(encoding="utf-8", newline="") as fh:
            reader = csv.reader(fh)
            current = next(reader)
            if header is None:
                header = current
        with path.open(encoding="utf-8", newline="") as fh:
            reader = csv.DictReader(fh)
            rows.extend(reader)
    if header is None:
        raise SystemExit(f"找不到 {name}.csv")
    return header, rows


def main() -> None:
    if len(sys.argv) < 4:
        raise SystemExit(__doc__)
    name, out, *columns = sys.argv[1:]
    header, rows = read_variants(name)
    missing = [c for c in columns if c not in header]
    if missing:
        raise SystemExit(f"{name}: 缺列 {missing}")

    out_path = Path(out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.writer(fh, quoting=csv.QUOTE_MINIMAL)
        writer.writerow(columns)
        for row in rows:
            writer.writerow([row.get(c, "") or "" for c in columns])
    print(f"{name} → {out_path}（{len(rows)} 行）")


if __name__ == "__main__":
    main()

import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { columnIndex, parseCsv, type CsvTable } from "./csv";

export function sampleExportDir(): string {
  const configured = process.env.SAMPLE_EXPORT_DIR;
  if (configured) return resolve(configured);
  // tsx 直跑时 __dirname = apps/api/src/sync
  return resolve(__dirname, "../../../../docs/sample_exports");
}

/**
 * 每张源表有两份导出：随机全量抽样 `X.csv` + 吸奶器专题 `X_breast_pump.csv`。
 * 两份并发加载（按自然键去重），交叉命中的 SPU 因此更多。
 */
const VARIANTS = ["", "_breast_pump"] as const;

export function readTable(name: string): CsvTable {
  const dir = sampleExportDir();
  const files: string[] = [];
  for (const variant of VARIANTS) {
    const file = resolve(dir, `${name}${variant}.csv`);
    if (existsSync(file)) files.push(file);
  }
  if (files.length === 0) {
    throw new Error(
      `找不到样例文件 ${resolve(dir, `${name}.csv`)} 或 ${name}_breast_pump.csv\n` +
        `请确认 docs/sample_exports 存在，或通过 SAMPLE_EXPORT_DIR 指定目录。`,
    );
  }

  let header: string[] | null = null;
  const rows: string[][] = [];
  for (const file of files) {
    const table = parseCsv(readFileSync(file, "utf8"));
    if (header === null) {
      header = table.header;
    } else if (table.header.join("\u0000") !== header.join("\u0000")) {
      throw new Error(`${file}: 表头与 ${files[0]} 不一致，无法合并加载。`);
    }
    rows.push(...table.rows);
  }
  return { header: header ?? [], rows };
}

const EMPTY = new Set(["", "none", "null", "nan", "n/a", "-"]);

export function text(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (EMPTY.has(trimmed.toLowerCase())) return null;
  return trimmed;
}

export function integer(value: string | undefined): number | null {
  const raw = text(value);
  if (raw === null) return null;
  const parsed = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed);
}

/** Decimal 列：保留源字符串精度，Prisma 可直接接收 string。0 是有效值。 */
export function decimal(value: string | undefined): string | null {
  const raw = text(value);
  if (raw === null) return null;
  const parsed = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(parsed)) return null;
  return String(parsed);
}

export function dayDate(value: string | null | undefined): Date | null {
  const raw = text(value);
  if (raw === null) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (!match) return null;
  const date = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function timestamp(value: string | undefined): Date | null {
  const raw = text(value);
  if (raw === null) return null;
  const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
  const date = new Date(normalized.length <= 19 ? `${normalized}Z` : normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function json(value: string | undefined): unknown | null {
  const raw = text(value);
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** 取众数，用于确定文件级 ds */
export function mode(values: Array<string | null>): string | null {
  const counter = new Map<string, number>();
  for (const value of values) {
    if (!value) continue;
    counter.set(value, (counter.get(value) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [value, count] of counter) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

export type CellGetter = (name: string) => string | undefined;

/** 返回 (row) => (columnName) => string | undefined，列名不存在时返回 undefined。 */
export function readerFactory(table: CsvTable): (row: string[]) => CellGetter {
  const index = columnIndex(table.header);
  return (row: string[]): CellGetter => (name: string) => {
    const position = index.get(name);
    return position === undefined ? undefined : row[position];
  };
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

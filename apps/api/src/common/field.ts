import type { DataField, DataStatus } from "@product360/shared";
import type { AuthUser } from "./auth-user";

export function asOfKey(value: Date | null | undefined): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

export function dayKey(value: Date | string): string {
  return typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

export function num(value: { toNumber(): number } | number | null | undefined): number | null {
  if (value == null) return null;
  return typeof value === "number" ? value : value.toNumber();
}

export function round(value: number | null | undefined, digits = 2): number | null {
  if (value == null || Number.isNaN(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function ratio(part: number, total: number, digits = 4): number {
  if (!total) return 0;
  return round(part / total, digits) ?? 0;
}

export function field<T>(
  status: DataStatus,
  source: string | null,
  at: Date | string | null,
  value: T | null,
): DataField<T> {
  return {
    status,
    source,
    asOf: at == null ? null : dayKey(at),
    value,
  };
}

/**
 * 商业敏感字段：无权限时状态 no_access 且 value 必须为 null，不能是 0。
 */
export function commercial<T>(
  user: AuthUser,
  status: DataStatus,
  source: string | null,
  at: Date | string | null,
  value: T | null,
): DataField<T> {
  if (!user.canViewCommercial) {
    return { status: "no_access", source: null, asOf: null, value: null };
  }
  return field(status, source, at, value);
}

/** 由多级类目名称拼路径，去重去空，用于面包屑与列表展示 */
export function categoryPath(levels: Array<string | null | undefined>): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const level of levels) {
    const name = level?.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out.join(" / ");
}

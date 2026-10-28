import type { DataStatus } from "../api/types";
import { StateTag, nonReady } from "./State";

/** 千分位；digits 为 0 时不显示小数，保持整数可读 */
export function formatNumber(value: number, digits = 0): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/**
 * 统一的值渲染。
 * 非 ready 态一律走 StateTag，保证同一个状态在全站长得一样。
 */
export function DataValue({
  field,
  digits = 0,
  prefix = "",
  suffix = "",
  emptyText,
  compact,
}: {
  field: { status: DataStatus; value: number | string | null };
  digits?: number;
  prefix?: string;
  suffix?: string;
  emptyText?: string;
  /** 表格单元格用紧凑态：空值收成「—」，避免全屏图标噪声 */
  compact?: boolean;
}) {
  const state = nonReady(field.status);
  if (state) {
    return (
      <StateTag status={state} text={state === "empty" ? emptyText : undefined} compact={compact} />
    );
  }
  if (field.value == null) {
    return <StateTag status="empty" text={emptyText} compact={compact} />;
  }

  const text =
    typeof field.value === "number" ? formatNumber(field.value, digits) : String(field.value);

  if (field.status === "delayed") {
    return (
      <span>
        <span className="num">{`${prefix}${text}${suffix}`}</span>
        <span style={{ marginLeft: 6 }}>
          <StateTag status="delayed" />
        </span>
      </span>
    );
  }
  return <span className="num">{`${prefix}${text}${suffix}`}</span>;
}

/** 来源 + 数据日期，弱提示，不抢主信息 */
export function MetaLine({
  source,
  asOf,
  extra,
}: {
  source?: string | null;
  asOf?: string | null;
  extra?: string | null;
}) {
  const parts = [
    source ? `来源 ${source}` : null,
    asOf ? `数据日期 ${asOf.slice(0, 10)}` : null,
    extra ?? null,
  ].filter(Boolean);
  if (!parts.length) return null;
  return <div className="kv-item__meta">{parts.join(" · ")}</div>;
}

/** 批次超过 48 小时时顶在页面上，避免用户把旧值当现值 */
export function DelayNotice({ statuses }: { statuses: DataStatus[] }) {
  if (!statuses.includes("delayed")) return null;
  return (
    <div className="hint-strip hint-strip--warn" style={{ marginBottom: 12 }}>
      部分字段的数据批次已超过 48 小时未更新，数值仅供参照。
    </div>
  );
}

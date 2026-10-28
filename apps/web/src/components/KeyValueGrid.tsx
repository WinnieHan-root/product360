import type { CSSProperties, ReactNode } from "react";

/**
 * 字段栅格：列数由调用方决定，不再依赖 auto-fill 猜列宽。
 * 窄屏（<1280）自动降列，保证不出现 3 个字段挤成 1 行的情况。
 */
export function KeyValueGrid({
  cols = 3,
  minWidth = 180,
  children,
}: {
  cols?: 2 | 3 | 4;
  minWidth?: number;
  children: ReactNode;
}) {
  return (
    <div
      className="kv-grid"
      style={
        {
          "--kv-cols": cols,
          "--kv-min": `${minWidth}px`,
        } as CSSProperties
      }
    >
      {children}
    </div>
  );
}

import { Card } from "antd";
import type { ReactNode } from "react";

/**
 * 统一区块卡：标题 / 副标题 / 右侧操作 / 内边距全站一致。
 * 只有需要统一的地方才用它，表格类卡片用 flush 去掉内边距。
 */
export function SectionCard({
  title,
  subtitle,
  extra,
  children,
  loading,
  flush,
  bordered = true,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  extra?: ReactNode;
  children?: ReactNode;
  loading?: boolean;
  /** 表格 / 图表铺满卡片时使用，去掉 body padding */
  flush?: boolean;
  bordered?: boolean;
}) {
  return (
    <Card
      className={`section-card${flush ? " section-card--flush" : ""}`}
      style={bordered ? undefined : { boxShadow: "none" }}
      loading={loading}
      title={
        title ? (
          <span>
            {title}
            {subtitle ? (
              <span className="section-note" style={{ marginLeft: 8, fontWeight: 400 }}>
                {subtitle}
              </span>
            ) : null}
          </span>
        ) : undefined
      }
      extra={extra}
    >
      {children}
    </Card>
  );
}

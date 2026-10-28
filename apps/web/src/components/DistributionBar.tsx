export interface DistributionItem {
  label: string;
  /** null 表示该档位无数据（例如无权限），不参与占比计算 */
  value: number | null;
  color: string;
  hint?: string | null;
}

/**
 * 分布条：把「五档情感 / 主题占比 / 覆盖度构成」这类数据
 * 从表格变成一眼能读出结构的横向条 + 计数行。
 *
 * 值为 null 的档位保留在图例里但不占宽度，避免把"无权限"画成 0%。
 */
export function DistributionBar({
  items,
  unit = "",
  showRatio = true,
  height = 10,
}: {
  items: DistributionItem[];
  unit?: string;
  showRatio?: boolean;
  height?: number;
}) {
  const total = items.reduce((sum, item) => sum + (item.value ?? 0), 0);
  const known = items.some((item) => item.value != null);

  return (
    <div className="dist">
      <div className="dist__track" style={{ height }}>
        {known
          ? items.map((item) => {
              const value = item.value ?? 0;
              if (!value) return null;
              return (
                <div
                  key={item.label}
                  className="dist__seg"
                  style={{ width: `${(value / total) * 100}%`, background: item.color }}
                  title={`${item.label} ${value}${unit}`}
                />
              );
            })
          : null}
      </div>
      <div className="dist__rows">
        {items.map((item) => (
          <div className="dist__row" key={item.label} title={item.hint ?? undefined}>
            <span className="dist__dot" style={{ background: item.color }} />
            <span>{item.label}</span>
            <span className="dist__count">
              {item.value == null ? "—" : `${item.value}${unit}`}
            </span>
            {showRatio ? (
              <span className="dist__ratio">
                {item.value == null || !total ? "—" : `${((item.value / total) * 100).toFixed(1)}%`}
              </span>
            ) : (
              <span className="dist__ratio" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

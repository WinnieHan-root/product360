import type { DataStatus } from "../api/types";
import { DataValue, MetaLine, formatNumber } from "./DataValue";
import { StateTag } from "./State";
import type { NonReadyStatus } from "./State";

type FieldLike = {
  status: DataStatus;
  source: string | null;
  asOf: string | null;
  value: number | string | null;
};

/** 有可展示的数字：ready 与 delayed 且值非空 */
export function isNumericValue(field: FieldLike): field is FieldLike & { value: number } {
  return (
    (field.status === "ready" || field.status === "delayed") &&
    typeof field.value === "number" &&
    Number.isFinite(field.value)
  );
}

/** 把「status 说 ready 但值为空」统一归到 empty，避免出现空白卡 */
export function nonReadyStatus(field: FieldLike): NonReadyStatus {
  return field.status === "ready" ? "empty" : field.status;
}

/** 键值对：label 在上、值在下，长文本自然换行 */
export function FieldBlock({
  label,
  field,
  digits = 0,
  prefix = "",
  suffix = "",
}: {
  label: string;
  field: FieldLike;
  digits?: number;
  prefix?: string;
  suffix?: string;
}) {
  return (
    <div className="kv-item">
      <div className="kv-item__label" title={label}>
        {label}
      </div>
      <div className="kv-item__value">
        <DataValue field={field} digits={digits} prefix={prefix} suffix={suffix} />
      </div>
      <MetaLine source={field.source} asOf={field.asOf} />
    </div>
  );
}

/**
 * 指标卡：一个语义数字 + 来源行。
 * 无权限 / 未接入 / 暂无数据时不显示 0 或空白，改为统一状态标签，
 * 避免"没权限"被误读成"业绩为 0"。
 */
export function MetricCard({
  label,
  field,
  digits = 0,
  prefix = "",
  suffix = "",
  unit,
}: {
  label: string;
  field: FieldLike;
  digits?: number;
  prefix?: string;
  suffix?: string;
  unit?: string;
}) {
  const numeric = isNumericValue(field);
  const delayed = field.status === "delayed";

  return (
    <div className="metric-card">
      <div className="metric-card__label" title={label}>
        {label}
      </div>
      {numeric ? (
        <div className="metric-card__value">
          <span>{`${prefix}${formatNumber(field.value, digits)}${suffix}`}</span>
          {unit ? <span className="metric-card__unit">{unit}</span> : null}
          {delayed ? (
            <span style={{ marginLeft: 6, verticalAlign: 2 }}>
              <StateTag status="delayed" />
            </span>
          ) : null}
        </div>
      ) : (
        <div className="metric-card__value metric-card__value--state">
          <StateTag status={nonReadyStatus(field)} />
        </div>
      )}
      <div className="metric-card__meta">
        <MetaLine source={field.source} asOf={field.asOf} />
      </div>
    </div>
  );
}

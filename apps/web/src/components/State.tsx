import { ClockCircleOutlined, DisconnectOutlined, LockOutlined, MinusOutlined } from "@ant-design/icons";
import type { DataStatus } from "../api/types";

/**
 * 五态视觉规范。
 *
 * ready         正常值，不加任何装饰
 * empty         源表有行但没值 —— 最轻，纯灰字
 * not_connected 源表没有这个字段 —— 虚线描边，和"没数据"区分
 * delayed       批次超过 48h —— 唯一带警示色的在值状态
 * no_access     商业字段无权限 —— 浅灰底 + 锁，绝不能被误读成 0
 */
export type NonReadyStatus = Exclude<DataStatus, "ready">;

const STATE_META: Record<
  NonReadyStatus,
  { label: string; className: string; icon: React.ReactNode }
> = {
  empty: { label: "暂无数据", className: "state state--empty", icon: <MinusOutlined /> },
  not_connected: { label: "未接入", className: "state state--nc", icon: <DisconnectOutlined /> },
  no_access: { label: "无权限", className: "state state--na", icon: <LockOutlined /> },
  delayed: { label: "延迟", className: "state state--delayed", icon: <ClockCircleOutlined /> },
};

/** ready 返回 null，由调用方渲染值本身；其余返回可渲染的状态 */
export function nonReady(status: DataStatus): NonReadyStatus | null {
  return status === "ready" ? null : status;
}

export function StateTag({
  status,
  text,
  compact,
}: {
  status: NonReadyStatus;
  /** 覆盖默认文案，例如 empty 想显示业务特定说明 */
  text?: string;
  /** 表格密集场景：empty 收成「—」，去掉图标，只保留语义必要的标记 */
  compact?: boolean;
}) {
  const meta = STATE_META[status];
  if (compact) {
    if (status === "empty") {
      return (
        <span className="state state--empty" title="暂无数据">
          —
        </span>
      );
    }
    return (
      <span className={meta.className} title={meta.label}>
        <span className="state__icon" aria-hidden>
          {meta.icon}
        </span>
        {text ?? meta.label}
      </span>
    );
  }
  return (
    <span className={meta.className}>
      <span className="state__icon" aria-hidden>
        {meta.icon}
      </span>
      {text ?? meta.label}
    </span>
  );
}

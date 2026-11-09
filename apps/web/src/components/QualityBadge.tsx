import { Badge, Drawer, Tag } from "antd";
import { useState } from "react";
import type { DataStatus, QualityIssue, QualityResponse, QualitySeverity } from "../api/types";

const SEVERITY_META: Record<QualitySeverity, { label: string; color: string; order: number }> = {
  high: { label: "严重", color: "red", order: 0 },
  medium: { label: "警告", color: "orange", order: 1 },
  low: { label: "提示", color: "blue", order: 2 },
};

const STATUS_NOTE: Record<DataStatus, string> = {
  ready: "",
  empty: "暂无数据",
  not_connected: "未做校验",
  delayed: "数据延迟",
  no_access: "无权限",
};

/**
 * 排序：有问题的先用严重度排，已评估无问题的居中，未做校验的垫底。
 * 正常商品应该零噪声，所以 0 告警时不显示胶囊数量，只留一句「检查通过」。
 */
function sortIssues(issues: QualityIssue[]) {
  const rank = (issue: QualityIssue) => {
    if (issue.status === "ready" && (issue.count ?? 0) > 0) return 0;
    if (issue.status === "ready") return 1;
    return 2;
  };
  return [...issues].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      SEVERITY_META[a.severity].order - SEVERITY_META[b.severity].order ||
      (b.count ?? 0) - (a.count ?? 0),
  );
}

function IssueRow({ issue }: { issue: QualityIssue }) {
  const meta = SEVERITY_META[issue.severity];
  const hit = issue.status === "ready" && (issue.count ?? 0) > 0;
  return (
    <div className={`quality-row${hit ? " quality-row--hit" : ""}`}>
      <div className="quality-row__head">
        {issue.status === "ready" ? (
          hit ? (
            <Tag color={meta.color}>{meta.label}</Tag>
          ) : (
            <Tag color="green">通过</Tag>
          )
        ) : (
          <Tag>{STATUS_NOTE[issue.status]}</Tag>
        )}
        <span className="quality-row__label">{issue.label}</span>
        {issue.status === "ready" ? (
          <span className={`quality-row__count num${hit ? " is-hit" : ""}`}>
            {hit ? issue.count : "0"}
          </span>
        ) : null}
      </div>
      <div className="quality-row__detail">{issue.detail}</div>
      {issue.samples.length ? (
        <div className="quality-row__samples">
          {issue.samples.map((sample) => (
            <code key={sample}>{sample}</code>
          ))}
        </div>
      ) : null}
      <div className="quality-row__source">
        {issue.source}
        {issue.asOf ? ` · ${issue.asOf}` : ""}
      </div>
    </div>
  );
}

/**
 * 质量告警是异常信息，正常商品应零噪声：0 条时只有一个静态绿标签，不占空间也不可点。
 * 挂在「基础信息」卡右上角，不新开卡片。
 */
export function QualityBadge({ quality }: { quality: QualityResponse | undefined }) {
  const [open, setOpen] = useState(false);
  if (!quality) return null;

  if (quality.total === 0) {
    return (
      <span
        className="quality-badge quality-badge--ok"
        title={`共检查 ${quality.checked} 项，${quality.checked - quality.evaluated} 项因数据未覆盖无法校验`}
      >
        数据检查通过（{quality.evaluated}/{quality.checked} 项可校验）
      </span>
    );
  }

  return (
    <>
      <button type="button" className="quality-badge quality-badge--hit" onClick={() => setOpen(true)}>
        <Badge status={quality.high > 0 ? "error" : "warning"} />
        {quality.total} 项数据质量问题
      </button>
      <Drawer
        title="数据质量检查"
        placement="right"
        width={520}
        open={open}
        onClose={() => setOpen(false)}
      >
        <div className="quality-summary">
          <span>
            共检查 {quality.checked} 项，<strong>{quality.evaluated}</strong> 项具备校验条件，
            <strong className={quality.total ? "is-hit" : ""}>{quality.total}</strong> 项发现问题
          </span>
          {quality.masterCoverage.total > 0 ? (
            <span className="section-note">
              SKU 主档覆盖 {quality.masterCoverage.covered}/{quality.masterCoverage.total}
              {quality.masterCoverage.covered < quality.masterCoverage.total
                ? " · 未覆盖部分无法区分「映射错误」与「主档缺失」"
                : ""}
            </span>
          ) : null}
        </div>

        <div className="quality-list">
          {sortIssues(quality.issues).map((issue) => (
            <IssueRow key={issue.key} issue={issue} />
          ))}
        </div>

        <div className="quality-foot">
          全部为现算，不依赖 Dataphin 巡检链路。仅覆盖能在本系统数据里判定的 5 项；
          运营归属、销售映射主键唯一性等需 ERP 底表的检查见全局质检规划。
        </div>
      </Drawer>
    </>
  );
}
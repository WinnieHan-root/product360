import { useQuery } from "@tanstack/react-query";
import { Alert, Empty, Progress, Space, Table, Tag, Tooltip } from "antd";
import { useParams } from "react-router-dom";
import { fetchOverview } from "../api/client";
import type { CartonValue, DataStatus, PackagingValue, Variant } from "../api/types";
import { DataValue, MetaLine } from "../components/DataValue";
import { FieldBlock } from "../components/Field";
import { KeyValueGrid } from "../components/KeyValueGrid";
import { SectionCard } from "../components/SectionCard";
import { StateTag } from "../components/State";

/** 非 ready 的字段在完整度里算缺失，并给出可读原因 */
const MISSING_TEXT: Record<DataStatus, string> = {
  ready: "已接入",
  empty: "暂无数据",
  not_connected: "未接入",
  delayed: "延迟",
  no_access: "无权限",
};

function dimension(value: number | null, unit: string) {
  return value == null ? (
    <StateTag status="empty" compact />
  ) : (
    <span className="num">
      {value} {unit}
    </span>
  );
}

function PackagingBlock({
  title,
  value,
  extra,
}: {
  title: string;
  value: PackagingValue | CartonValue | null;
  extra?: { label: string; value: number | null; unit: string };
}) {
  return (
    <div className="pack-line">
      <span className="pack-line__label">{title}</span>
      {value ? (
        <span className="pack-line__value">
          {value.length != null && value.width != null && value.height != null ? (
            <span className="num">
              {value.length} × {value.width} × {value.height} {value.lengthUnit}
            </span>
          ) : (
            <StateTag status="empty" compact />
          )}
          <span className="pack-line__sep">·</span>
          <span className="num">毛重 {value.weight ?? "—"} {value.weightUnit}</span>
          {"netWeight" in value ? (
            <>
              <span className="pack-line__sep">·</span>
              <span className="num">净重 {(value as PackagingValue).netWeight ?? "—"} {value.weightUnit}</span>
            </>
          ) : null}
          {extra ? (
            <>
              <span className="pack-line__sep">·</span>
              <span className="num">{extra.label} {extra.value ?? "—"} {extra.unit}</span>
            </>
          ) : null}
        </span>
      ) : (
        <StateTag status="not_connected" compact />
      )}
    </div>
  );
}

export function OverviewPage() {
  const { spu = "" } = useParams();
  const query = useQuery({
    queryKey: ["overview", spu],
    queryFn: () => fetchOverview(spu),
    enabled: Boolean(spu),
    retry: false,
  });

  if (query.isError) {
    return (
      <Alert type="error" showIcon message="概览加载失败" description="商品不存在或没有查看权限。" />
    );
  }

  const data = query.data;
  const packaging = data?.packaging;

  /** 完整度只看「字段是否真的拿到」，不引入规划外的新指标 */
  const tracked = [
    ...(data?.fields ?? []).map((item) => ({ label: item.label, status: item.field.status })),
    ...(data?.tags ?? []).map((item) => ({ label: item.label, status: item.field.status })),
    { label: "单品包装", status: packaging?.product.status ?? ("not_connected" as DataStatus) },
    { label: "箱规", status: packaging?.carton.status ?? ("not_connected" as DataStatus) },
  ];
  const readyCount = tracked.filter(
    (item) => item.status === "ready" || item.status === "delayed",
  ).length;
  const missing = tracked.filter(
    (item) => item.status !== "ready" && item.status !== "delayed",
  );
  const percent = tracked.length ? Math.round((readyCount / tracked.length) * 100) : 0;

  const variants = data?.variants ?? [];
  const withCode = variants.filter((row) => row.codes.length > 0).length;
  const withPrice = variants.filter(
    (row) => row.suggestPrice.status === "ready" || row.suggestPrice.status === "delayed",
  ).length;

  return (
    <div className="page-stack">
      <div className="detail-grid">
        <div className="detail-col">
          <SectionCard title="基础信息" loading={query.isLoading}>
            <KeyValueGrid cols={3}>
              {(data?.fields ?? []).map((item) => (
                <FieldBlock key={item.key} label={item.label} field={item.field} />
              ))}
            </KeyValueGrid>
          </SectionCard>

          <SectionCard title="标签" subtitle="类目 / 场景 / 系列" loading={query.isLoading}>
            <KeyValueGrid cols={3}>
              {(data?.tags ?? []).map((item) => (
                <FieldBlock key={item.key} label={item.label} field={item.field} />
              ))}
            </KeyValueGrid>
          </SectionCard>

        </div>

        <div className="detail-col">
          <SectionCard title="完整度与变体" loading={query.isLoading}>
            <div className="completeness">
              <div className="completeness__head">
                <span className="completeness__ratio num">
                  {readyCount}/{tracked.length}
                </span>
                <span className="completeness__pct num">字段接入 {percent}%</span>
              </div>
              <Progress
                percent={percent}
                showInfo={false}
                size={["100%", 6]}
                strokeColor="#1F8A4C"
                trailColor="#EAECF0"
              />
              <div className="completeness__label">缺失项 {missing.length} 个</div>
              <div className="chip-list">
                {missing.length ? (
                  missing.map((item) => (
                    <span className="chip-list__item" key={item.label}>
                      {item.label}
                      <span className="chip-list__reason">{MISSING_TEXT[item.status]}</span>
                    </span>
                  ))
                ) : (
                  <span className="section-note">全部字段已接入</span>
                )}
              </div>
            </div>

            <div className="card-divider" />

            <div className="mini-stats">
              <div className="mini-stats__item">
                <div className="mini-stats__label">变体总数</div>
                <div className="mini-stats__value num">{data?.variantsMeta.total ?? "—"}</div>
              </div>
              <div className="mini-stats__item">
                <div className="mini-stats__label">有渠道编码</div>
                <div className="mini-stats__value num">{withCode}</div>
              </div>
              <div className="mini-stats__item">
                <div className="mini-stats__label">有建议售价</div>
                <div className="mini-stats__value num">{withPrice}</div>
              </div>
            </div>
            {data ? (
              <MetaLine source={data.variantsMeta.source} asOf={data.variantsMeta.asOf} />
            ) : null}
          </SectionCard>

          <SectionCard title="包装信息" loading={query.isLoading}>
            <PackagingBlock title="单品" value={packaging?.product.value ?? null} />
            <MetaLine
              source={packaging?.product.source}
              asOf={packaging?.product.asOf}
              extra={packaging?.product.status === "not_connected" ? "未接入" : null}
            />
            <PackagingBlock
              title="箱规"
              value={packaging?.carton.value ?? null}
              extra={{
                label: "装箱数",
                value: (packaging?.carton.value as CartonValue | undefined)?.num ?? null,
                unit: "件",
              }}
            />
            <MetaLine source={packaging?.carton.source} asOf={packaging?.carton.asOf} />
          </SectionCard>


        </div>
      </div>

      <SectionCard
        flush
        title="变体（SKU）"
        subtitle={data ? `共 ${data.variantsMeta.total} 个` : null}
        loading={query.isLoading}
      >
        <Table<Variant>
          rowKey="skuCode"
          size="small"
          tableLayout="fixed"
          dataSource={variants}
          locale={{ emptyText: <Empty description="该 SPU 暂无 SKU 明细" /> }}
          pagination={{
            defaultPageSize: 20,
            pageSizeOptions: [20, 50],
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条`,
            style: { paddingRight: 16 },
          }}
          columns={[
            {
              title: "变体",
              width: 240,
              render: (_, row) => (
                <div>
                  <div className="cell-title">{row.skuName}</div>
                  <div className="cell-sub">{row.skuCode}</div>
                </div>
              ),
            },
            { title: "状态", dataIndex: "skuStateLabel", width: 84 },
            {
              title: "建议售价",
              width: 110,
              align: "right",
              render: (_, row) => (
                <DataValue
                  field={row.suggestPrice}
                  digits={2}
                  prefix={row.currency === "USD" || !row.currency ? "$" : `${row.currency} `}
                  compact
                />
              ),
            },
            {
              title: "渠道编码",
              width: 316,
              render: (_, row) =>
                row.codes.length ? (
                  <Space size={4} wrap>
                    {row.codes.slice(0, 2).map((code, index) => (
                      <Tag key={`${code.channel}-${index}`}>
                        {code.channelName ?? code.channel}
                        {code.site ? ` / ${code.site}` : ""}
                        {code.platformSku ? ` / ${code.platformSku}` : ""}
                      </Tag>
                    ))}
                    {row.codes.length > 2 ? (
                      <Tooltip
                        title={row.codes.map(
                          (code) =>
                            `${code.channelName ?? code.channel} · 站点 ${code.site ?? "—"} · 店铺 ${
                              code.shopCode ?? "—"
                            } · 平台SKU ${code.platformSku ?? "—"}${
                              code.asin ? ` · ASIN ${code.asin}` : ""
                            }`,
                        )}
                      >
                        <Tag>+{row.codes.length - 2}</Tag>
                      </Tooltip>
                    ) : null}
                  </Space>
                ) : (
                  <StateTag status="empty" compact />
                ),
            },
            {
              title: "未接入编码",
              width: 230,
              render: (_, row) => (
                <Space size={4} wrap>
                  {row.unavailableCodes.map((item) => (
                    <Tag key={item.label} color="default" style={{ color: "#98A2B3" }}>
                      {item.label} 未接入
                    </Tag>
                  ))}
                </Space>
              ),
            },
          ]}
          scroll={{ x: 980 }}
        />
      </SectionCard>
    </div>
  );
}

import { useQuery } from "@tanstack/react-query";
import { Alert, Empty, Segmented, Table, Tooltip } from "antd";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { fetchChannels } from "../api/client";
import type { ChannelRow } from "../api/types";
import { DataValue, DelayNotice } from "../components/DataValue";
import { MetricCard } from "../components/Field";
import { MiniChart } from "../components/MiniChart";
import { SectionCard } from "../components/SectionCard";
import { StateTag } from "../components/State";
import { TrendChart } from "../components/TrendChart";

const DAY_OPTIONS = [7, 14, 30, 60, 90];

/** 渠道聚合只看公开行的真实数值，无权限行不参与求和 */
function aggregateByChannel(rows: ChannelRow[] | undefined) {
  const map = new Map<
    string,
    { name: string; amount: number; skus: number; inStock: number; blocked: boolean; live: number }
  >();
  for (const row of rows ?? []) {
    const key = row.channel;
    const current =
      map.get(key) ??
      { name: row.channelName ?? row.channel, amount: 0, skus: 0, inStock: 0, blocked: false, live: 0 };
    current.skus += 1;
    if (row.salesAmountUsd.status === "no_access" || row.inStockQty.status === "no_access") {
      current.blocked = true;
    }
    if (typeof row.salesAmountUsd.value === "number") current.amount += row.salesAmountUsd.value;
    if (typeof row.inStockQty.value === "number") current.inStock += row.inStockQty.value;
    if (row.listingStatus.value === "在售" || row.listingStatus.value === "1") current.live += 1;
    map.set(key, current);
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount);
}

export function ChannelsPage() {
  const { spu = "" } = useParams();
  const [days, setDays] = useState(30);
  const query = useQuery({
    queryKey: ["channels", spu, days],
    queryFn: () => fetchChannels(spu, days),
    enabled: Boolean(spu),
    retry: false,
  });

  if (query.isError) {
    return <Alert type="error" showIcon message="渠道数据加载失败" description="商品不存在或没有查看权限。" />;
  }

  const data = query.data;
  const channels = aggregateByChannel(data?.rows);
  const totalAmount = channels.reduce((sum, item) => sum + item.amount, 0);
  const blocked = channels.some((item) => item.blocked);

  return (
    <div className="page-stack">
      <SectionCard
        loading={query.isLoading}
        title={data ? `近 ${data.window.days} 天` : "经营数据"}
        subtitle={data ? `${data.window.from} ~ ${data.window.to}` : null}
        extra={
          <Segmented
            value={days}
            options={DAY_OPTIONS.map((value) => ({ value, label: `${value} 天` }))}
            onChange={(value) => setDays(Number(value))}
          />
        }
      >
        <DelayNotice statuses={(data?.summary ?? []).map((item) => item.field.status)} />
        <div className="metric-row">
          {(data?.summary ?? []).map((item) => (
            <MetricCard
              key={item.key}
              label={item.label}
              field={item.field}
              digits={item.key === "salesAmountUsd" ? 2 : 0}
              prefix={item.key === "salesAmountUsd" ? "$" : ""}
            />
          ))}
        </div>
      </SectionCard>

      <div className="detail-grid">
        <SectionCard
          title="销量与销售额趋势"
          loading={query.isLoading}
          extra={
            data ? <span className="section-note">{data.trend.source ?? "销售日汇总"}</span> : null
          }
        >
          {data ? (
            <>
              <DelayNotice statuses={[data.trend.status]} />
              {data.trend.status === "no_access" ? (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="无权限查看销量与销售额趋势"
                />
              ) : data.trend.saleQty.every((item) => item == null) &&
                data.trend.salesAmountUsd.every((item) => item == null) ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="窗口内暂无销量数据" />
              ) : (
                <TrendChart
                  height={214}
                  labels={data.trend.labels}
                  series={[
                    { name: "销量", data: data.trend.saleQty, type: "bar", axis: 0 },
                    {
                      name: "销售额（美元）",
                      data: data.trend.salesAmountUsd,
                      type: "line",
                      axis: 1,
                    },
                  ]}
                />
              )}
              <Tooltip title={data.trend.note}>
                <div className="section-note" style={{ marginTop: 6 }}>
                  空白天数代表源表当日无该商品的统计行。
                </div>
              </Tooltip>
            </>
          ) : null}
        </SectionCard>

        <div className="detail-col">
          <SectionCard
            title="渠道销售贡献"
            subtitle={data ? `${channels.length} 个渠道` : null}
            loading={query.isLoading}
          >
            {channels.length && totalAmount > 0 && !blocked ? (
              <>
                <MiniChart
                  kind="hbar"
                  height={104}
                  data={channels
                    .slice(0, 5)
                    .map((item) => ({ label: item.name, value: Math.round(item.amount) }))}
                />
                <div className="section-note" style={{ marginTop: 2 }}>
                  金额合计 ${totalAmount.toFixed(0)} · 按渠道汇总
                </div>
              </>
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={blocked ? "无权限查看销售额构成" : "窗口内暂无销售额"}
              />
            )}

            <div className="card-divider" />

            <div className="status-list">
              {channels.map((item) => (
                <div className="status-list__row" key={item.name}>
                  <span className="status-list__name">{item.name}</span>
                  <span className="status-list__meta num">
                    {item.live}/{item.skus} 在售
                  </span>
                  {item.blocked ? (
                    <StateTag status="no_access" compact />
                  ) : item.live > 0 ? (
                    <span className="status-dot status-dot--on" title="有在售 SKU" />
                  ) : (
                    <span className="status-dot status-dot--off" title="无在售 SKU" />
                  )}
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>

      <SectionCard
        title="渠道明细"
        flush
        loading={query.isLoading}
        extra={data ? <span className="section-note">共 {data.rows.length} 条</span> : null}
      >
        <Table<ChannelRow>
          rowKey={(row) => `${row.channel}|${row.site}|${row.shopCode}|${row.platformSku}`}
          size="small"
          dataSource={data?.rows ?? []}
          pagination={data && data.rows.length > 20 ? { pageSize: 20 } : false}
          locale={{ emptyText: <Empty description="该商品暂无渠道数据" /> }}
          columns={[
            {
              title: "渠道",
              width: 148,
              render: (_, row) => (
                <div>
                  <div className="cell-title">{row.channelName ?? row.channel}</div>
                  <div className="cell-sub">{row.channel}</div>
                </div>
              ),
            },
            {
              title: "站点 / 店铺",
              width: 132,
              render: (_, row) => (
                <div>
                  <div className="cell-title">{row.site ?? <StateTag status="empty" compact />}</div>
                  <div className="cell-sub">{row.shopCode ?? "—"}</div>
                </div>
              ),
            },
            {
              title: "平台 SKU",
              width: 190,
              render: (_, row) => (
                <div>
                  <div className="cell-title">
                    {row.platformSku ?? <StateTag status="not_connected" compact />}
                  </div>
                  <div className="cell-sub">
                    {row.skuCode ? `内部 SKU ${row.skuCode}` : "无内部 SKU 关联"}
                    {row.asin ? ` · ASIN ${row.asin}` : ""}
                  </div>
                </div>
              ),
            },
            {
              title: "挂牌状态",
              width: 94,
              render: (_, row) => <DataValue field={row.listingStatus} compact />,
            },
            {
              title: "建议售价",
              width: 100,
              align: "right",
              render: (_, row) => <DataValue field={row.suggestPrice} digits={2} prefix="$" compact />,
            },
            {
              title: "销量",
              width: 72,
              align: "right",
              render: (_, row) => <DataValue field={row.saleQty} compact />,
            },
            {
              title: "销售额",
              width: 108,
              align: "right",
              render: (_, row) => <DataValue field={row.salesAmountUsd} digits={2} prefix="$" compact />,
            },
            {
              title: "在库",
              width: 68,
              align: "right",
              render: (_, row) => <DataValue field={row.inStockQty} compact />,
            },
            {
              title: "在途",
              width: 68,
              align: "right",
              render: (_, row) => <DataValue field={row.onWayQty} compact />,
            },
          ]}
          scroll={{ x: 980 }}
        />
      </SectionCard>
    </div>
  );
}
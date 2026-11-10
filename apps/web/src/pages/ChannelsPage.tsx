import { useQuery } from "@tanstack/react-query";
import { Alert, Empty, Segmented, Tag, Table, Tooltip } from "antd";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { fetchChannels, fetchListings } from "../api/client";
import type { ChannelRow, ListingChannelStat, ListingItem } from "../api/types";
import { DataValue, DelayNotice } from "../components/DataValue";

import { MetricCard } from "../components/Field";
import { MiniChart } from "../components/MiniChart";
import { SectionCard } from "../components/SectionCard";
import { StateTag } from "../components/State";
import { TrendChart } from "../components/TrendChart";

const DAY_OPTIONS = [7, 14, 30, 60, 90];

/**
 * listing 状态口径与后端一致：源端已归一，前端不再推导。
 * draft 只出现在 Shopify（店铺里建好但未发布），内容多半已填满，不能并入 offline。
 */
const LISTING_STATUS_META: Record<string, { label: string; color: string }> = {
  online: { label: "在线", color: "green" },
  offline: { label: "已下架", color: "default" },
  draft: { label: "草稿", color: "blue" },
  deleted: { label: "已删除", color: "red" },
};

const LISTING_STATUS_OPTIONS = [
  { label: "仅在线", value: "online" },
  { label: "全部", value: "all" },
  { label: "仅下架", value: "offline" },
  { label: "草稿", value: "draft" },
  { label: "已删除", value: "deleted" },
];

const CONTENT_FIELDS = ["标题", "主图", "描述", "价格", "状态"];

/** 5 项内容标记的紧凑刻度 */
function ContentDots({ flags }: { flags: ListingItem["contentFlags"] }) {
  const list = [flags.title, flags.mainImage, flags.description, flags.price, flags.status];
  return (
    <Tooltip
      title={CONTENT_FIELDS.map((name, index) => `${name}${list[index] ? "✓" : "✗"}`).join(" · ")}
    >
      <span className="content-dots">
        {list.map((on, index) => (
          <i key={index} className={on ? "on" : "off"} />
        ))}
      </span>
    </Tooltip>
  );
}

function ListingStatusTag({ status, raw }: { status: string | null; raw: string | null }) {
  const meta = status ? LISTING_STATUS_META[status] : null;
  const tag = <Tag color={meta?.color}>{meta?.label ?? status ?? "—"}</Tag>;
  return raw ? <Tooltip title={`源端原值：${raw}`}>{tag}</Tooltip> : tag;
}

/** 每个渠道取一条代表 listing：优先在线且有标题，避免把多店铺合成一条假标题 */
function pickListing(items: ListingItem[], channel: string) {
  const rows = items.filter((item) => item.channel === channel);
  return (
    rows.find((item) => item.listingStatus === "online" && item.title.value) ??
    rows.find((item) => item.title.value) ??
    rows[0]
  );
}

function gapText(missing: ListingChannelStat["missing"]) {
  const parts = [
    missing.title ? `标题 ${missing.title}` : "",
    missing.image ? `主图 ${missing.image}` : "",
    missing.description ? `描述 ${missing.description}` : "",
    missing.price ? `价格 ${missing.price}` : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "无缺口";
}

/** contentAvg 是 0~5 的均值，换算成百分比时标注原值，不丢精度也不假装是实测百分比 */
function contentPercent(avg: number | null) {
  if (avg == null) return null;
  return { percent: Math.round((avg / 5) * 100), raw: avg };
}

/** 渠道聚合只看公开行的真实数值，无权限行不参与求和 */
function aggregateByChannel(rows: ChannelRow[] | undefined) {
  const map = new Map<
    string,
    {
      key: string;
      name: string;
      amount: number;
      skus: number;
      inStock: number;
      blocked: boolean;
      live: number;
    }
  >();
  for (const row of rows ?? []) {
    const key = row.channel;
    const current =
      map.get(key) ?? {
        key,
        name: row.channelName ?? row.channel,
        amount: 0,
        skus: 0,
        inStock: 0,
        blocked: false,
        live: 0,
      };
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
  const [listingStatus, setListingStatus] = useState("online");
  const query = useQuery({
    queryKey: ["channels", spu, days],
    queryFn: () => fetchChannels(spu, days),
    enabled: Boolean(spu),
    retry: false,
  });

  const listings = useQuery({
    queryKey: ["listings", spu, listingStatus],
    queryFn: () => fetchListings(spu, listingStatus),
    enabled: Boolean(spu),
    retry: false,
  });

  if (query.isError) {
    return <Alert type="error" showIcon message="渠道数据加载失败" description="商品不存在或没有查看权限。" />;
  }

  const data = query.data;
  const listingData = listings.data;
  const channels = aggregateByChannel(data?.rows);

  const matrixChannels = listingData?.channels ?? [];
  const totalAmount = channels.reduce((sum, item) => sum + item.amount, 0);
  const blocked = channels.some((item) => item.blocked);

  return (
    <div className="page-stack">
      <SectionCard
        title="商品全渠道对比"
        loading={listings.isLoading}
        extra={
          listingData ? (
            <span className="section-note">
              {listingData.counts.total} 条 listing · 在线 {listingData.counts.online} · 覆盖{" "}
              {listingData.channels.length} 个渠道
            </span>
          ) : null
        }
      >
        {listingData ? (
          <>
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <Segmented
                size="small"
                value={listingStatus}
                onChange={(value) => setListingStatus(String(value))}
                options={LISTING_STATUS_OPTIONS.map((option) => ({
                  ...option,
                  label:
                    option.value === "all"
                      ? `全部 ${listingData.counts.total}`
                      : `${option.label} ${
                          listingData.counts[
                            option.value as "online" | "offline" | "draft" | "deleted"
                          ] ?? 0
                        }`,
                }))}
              />
              <span className="section-note">
                默认只看在线。每列取一条有标题的 listing，站点多时记在列头，不按店铺拆列。
              </span>
            </div>

            {matrixChannels.length ? (
              <div className="matrix-split">
                <div className="metric-matrix-wrap">
                  <table className="metric-matrix">
                    <thead>
                      <tr>
                        <th className="metric-matrix__rowhead">对比项</th>
                        {matrixChannels.map((item) => {
                          const pick = pickListing(listingData.items, item.channel);
                          const name =
                            channels.find((entry) => entry.key === item.channel)?.name ??
                            item.channel;
                          const siteText = item.sites.length
                            ? `${item.sites.slice(0, 2).join(" / ")}${
                                item.sites.length > 2 ? ` +${item.sites.length - 2}` : ""
                              }`
                            : "";
                          const sub = [pick?.shopCode, siteText].filter(Boolean).join(" · ");
                          return (
                            <th key={item.channel}>
                              <div className="matrix-head">
                                <span className="matrix-head__name">{name}</span>
                                {sub ? <span className="matrix-head__meta">{sub}</span> : null}
                                <span className="matrix-head__meta num">
                                  {item.listingCount} 条 · 在线 {item.onlineCount}
                                </span>
                              </div>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <th className="metric-matrix__rowhead">上架状态</th>
                        {matrixChannels.map((item) => {
                          const pick = pickListing(listingData.items, item.channel);
                          return (
                            <td key={item.channel}>
                              {pick ? (
                                <ListingStatusTag
                                  status={pick.listingStatus}
                                  raw={pick.listingStatusRaw}
                                />
                              ) : (
                                <span className="muted">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                      <tr>
                        <th className="metric-matrix__rowhead">当前价格</th>
                        {matrixChannels.map((item) => {
                          const pick = pickListing(listingData.items, item.channel);
                          return (
                            <td key={item.channel}>
                              {pick ? (
                                <DataValue
                                  field={pick.salePrice}
                                  digits={2}
                                  prefix={
                                    !pick.currencyCode || pick.currencyCode === "USD"
                                      ? "$"
                                      : `${pick.currencyCode} `
                                  }
                                />
                              ) : (
                                <span className="muted">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                      <tr>
                        <th className="metric-matrix__rowhead">库存</th>
                        {matrixChannels.map((item) => {
                          const stock = channels.find((entry) => entry.key === item.channel);
                          return (
                            <td key={item.channel} className="num">
                              {stock && stock.inStock > 0 ? (
                                stock.inStock.toLocaleString()
                              ) : (
                                <span className="muted">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                      <tr>
                        <th className="metric-matrix__rowhead">商品标题</th>
                        {matrixChannels.map((item) => {
                          const pick = pickListing(listingData.items, item.channel);
                          const title = pick?.title.value;
                          return (
                            <td key={item.channel}>
                              {title ? (
                                <span className="metric-matrix__text" title={title}>
                                  {title}
                                </span>
                              ) : (
                                <span className="muted">无标题</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                      <tr>
                        <th className="metric-matrix__rowhead">副标题 / 描述</th>
                        {matrixChannels.map((item) => {
                          const pick = pickListing(listingData.items, item.channel);
                          const summary = pick?.descriptionSummary.value;
                          return (
                            <td key={item.channel}>
                              {summary ? (
                                <span className="metric-matrix__text" title={summary}>
                                  {summary}
                                </span>
                              ) : (
                                <span className="muted">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                      <tr>
                        <th className="metric-matrix__rowhead">内容完整度</th>
                        {matrixChannels.map((item) => {
                          const value = contentPercent(item.contentAvg);
                          return (
                            <td key={item.channel}>
                              {value ? (
                                <div className="matrix-meter">
                                  <span className="matrix-meter__value num">
                                    {value.raw}
                                    <small> / 5</small>
                                  </span>
                                  <span className="matrix-meter__bar">
                                    <i style={{ width: `${value.percent}%` }} />
                                  </span>
                                </div>
                              ) : (
                                <span className="muted">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                      <tr>
                        <th className="metric-matrix__rowhead">内容标记</th>
                        {matrixChannels.map((item) => {
                          const pick = pickListing(listingData.items, item.channel);
                          return (
                            <td key={item.channel}>
                              {pick ? (
                                <ContentDots flags={pick.contentFlags} />
                              ) : (
                                <span className="muted">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                      <tr>
                        <th className="metric-matrix__rowhead">负责人</th>
                        {matrixChannels.map((item) => {
                          const pick = pickListing(listingData.items, item.channel);
                          return (
                            <td key={item.channel}>
                              {pick?.operatorName ?? <span className="muted">未指定</span>}
                            </td>
                          );
                        })}
                      </tr>
                      <tr>
                        <th className="metric-matrix__rowhead">内容缺口</th>
                        {matrixChannels.map((item) => {
                          const gaps =
                            item.missing.title +
                            item.missing.image +
                            item.missing.description +
                            item.missing.price;
                          return (
                            <td key={item.channel}>
                              <span className={gaps ? "text-warn" : "muted"}>
                                {gapText(item.missing)}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    </tbody>
                  </table>
                </div>
                <aside className="gap-rail">
                  <div className="gap-rail__title">在售状态概览</div>
                  {(["online", "offline", "draft", "deleted"] as const).map((key) => {
                    const count = listingData.counts[key] ?? 0;
                    const percent = listingData.counts.total
                      ? Math.round((count / listingData.counts.total) * 100)
                      : 0;
                    return (
                      <div className="gap-rail__row" key={key}>
                        <div className="gap-rail__name">{LISTING_STATUS_META[key].label}</div>
                        <div className="gap-rail__meta num">
                          {count} 条 · {percent}%
                        </div>
                      </div>
                    );
                  })}
                  <div className="gap-rail__title gap-rail__title--sub">渠道覆盖</div>
                  <div className="gap-rail__row">
                    <div className="gap-rail__name">渠道数</div>
                    <div className="gap-rail__meta num">{listingData.channels.length}</div>
                  </div>
                  <div className="gap-rail__row">
                    <div className="gap-rail__name">有在线 listing</div>
                    <div className="gap-rail__meta num">
                      {listingData.channels.filter((entry) => entry.onlineCount > 0).length}
                    </div>
                  </div>
                </aside>
              </div>
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="该商品当前筛选下没有上架记录"
              />
            )}

            <div className="matrix-foot">
              <span>来源：{listingData.coverage.source}</span>
              <span>数据日期：{listingData.coverage.asOf ?? "—"}</span>
              <span>{listingData.coverage.note}</span>
            </div>
          </>
        ) : null}
      </SectionCard>

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
            subtitle={data ? `${channels.length} 个渠道 · 销售口径` : null}
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

            <div className="section-note" style={{ marginTop: 8 }}>
              本卡按渠道商品编码表统计，与上方上架矩阵（在线商品全渠道表）是两个数据源，渠道数可能不同。
            </div>
          </SectionCard>
        </div>
      </div>

      <SectionCard
        title="在线商品明细"
        flush
        loading={listings.isLoading}
        extra={
          listingData ? (
            <span className="section-note">{listingData.items.length} 条</span>
          ) : null
        }
      >
        <Table<ListingItem>
          rowKey={(row) => `${row.channel}|${row.site}|${row.shopCode}|${row.msku}|${row.externalId}`}
          size="small"
          dataSource={listingData?.items ?? []}
          pagination={listingData && listingData.items.length > 20 ? { pageSize: 20 } : false}
          locale={{ emptyText: <Empty description="当前筛选下没有 listing" /> }}
          scroll={{ x: 1180 }}
          expandable={{
            expandedRowRender: (row) => (
              <div className="listing-detail">
                <div className="listing-detail__text">
                  <div className="section-note">描述摘要</div>
                  {row.descriptionSummary.value ? (
                    <p>{row.descriptionSummary.value}</p>
                  ) : (
                    <p className="muted">源表无描述摘要</p>
                  )}
                </div>
                <div className="listing-detail__meta">
                  <div>
                    <span className="section-note">外部 ID</span>
                    <div>
                      {row.externalId ?? "—"}
                      {row.externalIdType ? `（${row.externalIdType}）` : ""}
                    </div>
                    {row.parentExternalId ? <div className="cell-sub">父级 {row.parentExternalId}</div> : null}
                  </div>
                  <div>
                    <span className="section-note">店铺</span>
                    <div>{row.shopCode ?? "—"}</div>
                  </div>
                  <div>
                    <span className="section-note">源表</span>
                    <div>{row.srcTable ?? "—"}</div>
                  </div>
                </div>
                {row.mainImageUrl.value ? (
                  <img
                    className="listing-detail__img"
                    src={row.mainImageUrl.value}
                    alt={row.title.value ?? "商品主图"}
                    loading="lazy"
                  />
                ) : null}
              </div>
            ),
          }}
          columns={[
            {
              title: "渠道 / 站点",
              width: 132,
              render: (_, row) => (
                <div>
                  <div className="cell-title">{row.channel}</div>
                  <div className="cell-sub">
                    {row.site ?? "—"}
                    {row.shopCode ? ` · ${row.shopCode}` : ""}
                  </div>
                </div>
              ),
            },
            {
              title: "平台 SKU",
              width: 148,
              render: (_, row) => (
                <div>
                  <div className="cell-title">{row.msku}</div>
                  <div className="cell-sub">{row.externalId ?? "无外部 ID"}</div>
                </div>
              ),
            },
            {
              title: "上架状态",
              width: 92,
              render: (_, row) => (
                <ListingStatusTag status={row.listingStatus} raw={row.listingStatusRaw} />
              ),
            },
            {
              title: "内容",
              width: 92,
              render: (_, row) => (
                <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                  <ContentDots flags={row.contentFlags} />
                  <span className="cell-sub">{row.contentItemCnt ?? 0}/5</span>
                </span>
              ),
            },
            {
              title: "标题",
              render: (_, row) => (
                <div>
                  <div className="cell-title">
                    {row.title.value ??
                      (row.title.status === "ready" ? (
                        "—"
                      ) : (
                        <StateTag status={row.title.status} compact />
                      ))}
                  </div>
                  <div className="cell-sub">{row.operatorName ?? "无负责人"}</div>
                </div>
              ),
            },
            {
              title: "售价",
              width: 106,
              align: "right",
              render: (_, row) => (
                <div>
                  <DataValue field={row.salePrice} digits={2} compact />
                  <div className="cell-sub">{row.currencyCode ?? "—"}</div>
                </div>
              ),
            },
            {
              title: "链接",
              width: 58,
              align: "center",
              render: (_, row) =>
                row.productLink ? (
                  <a href={row.productLink} target="_blank" rel="noreferrer">
                    打开
                  </a>
                ) : (
                  <span className="muted">—</span>
                ),
            },
          ]}
        />
      </SectionCard>

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
import { useQuery } from "@tanstack/react-query";
import { Alert, Empty, Progress, Segmented, Table, Tag } from "antd";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { fetchExternal } from "../api/client";
import type { DataField, ExternalResponse } from "../api/types";
import { DataValue, DelayNotice, MetaLine } from "../components/DataValue";
import { DistributionBar } from "../components/DistributionBar";
import { MetricCard } from "../components/Field";
import { SectionCard } from "../components/SectionCard";
import { StateTag } from "../components/State";
import { TrendChart } from "../components/TrendChart";

const DAY_OPTIONS = [30, 90];

type Topic = ExternalResponse["tickets"]["topics"][number];
type Competitor = ExternalResponse["competitors"]["rows"][number];

const SENTIMENT_COLOR = ["#B42318", "#F04438", "#98A2B3", "#32A05F", "#1F8A4C"];

/** 五档情感：一根横向分布条 + 计数行，一眼看出结构 */
function SentimentBlock({ items }: { items: ExternalResponse["review"]["sentiments"] }) {
  return (
    <DistributionBar
      unit=" 条"
      items={items.map((item) => ({
        label: item.sentiment,
        value: item.count,
        color: SENTIMENT_COLOR[item.bucket - 1] ?? "#98A2B3",
        hint: item.ratio == null ? "无权限查看明细" : `占比 ${(item.ratio * 100).toFixed(1)}%`,
      }))}
    />
  );
}

/** 计数字段：来自接口已有聚合，缺失时按 empty 展示 */
function countField(
  value: number | undefined,
  status: DataField<number>["status"] = "ready",
): DataField<number> {
  return {
    status: value == null ? "empty" : status,
    source: null,
    asOf: null,
    value: value ?? null,
  };
}

export function ExternalPage() {
  const { spu = "" } = useParams();
  const [days, setDays] = useState(30);
  const query = useQuery({
    queryKey: ["external", spu, days],
    queryFn: () => fetchExternal(spu, days),
    enabled: Boolean(spu),
    retry: false,
  });

  if (query.isError) {
    return (
      <Alert type="error" showIcon message="外部信息加载失败" description="商品不存在或没有查看权限。" />
    );
  }

  const data = query.data;
  const review = data?.review;
  const tickets = data?.tickets;
  const competitors = data?.competitors;

  return (
    <div className="page-stack">
      {/* 段一：窗口 + 指标带 */}
      <div className="scope-bar">
        <span>
          {data ? `窗口 ${data.window.from} ~ ${data.window.to}` : "外部信息"}
          <span className="scope-bar__sep">|</span>
          口径：自有品牌评论（NPS）+ VOC 工单 + 竞品评论
        </span>
        <Segmented
          value={days}
          options={DAY_OPTIONS.map((value) => ({ value, label: `${value} 天` }))}
          onChange={(value) => setDays(Number(value))}
        />
      </div>

      <div className="metric-row">
        <MetricCard label="星级均值" field={review?.ratingAvg ?? countField(undefined)} digits={2} />
        <MetricCard label="评论数" field={review?.reviewCount ?? countField(undefined)} />
        <MetricCard
          label="服务工单"
          field={{
            status: tickets?.status ?? "empty",
            source: tickets?.source ?? null,
            asOf: tickets?.asOf ?? null,
            value: tickets?.total ?? null,
          }}
        />
        <MetricCard label="工单主题" field={countField(tickets?.topics.length)} />
        <MetricCard label="竞品行" field={countField(competitors?.rows.length)} />
      </div>

      {review ? <DelayNotice statuses={[review.ratingAvg.status, review.reviewCount.status]} /> : null}

      {/* 段二：情感结构 + 口碑走势 */}
      <div className="grid-2col">
        <SectionCard
          title="五档情感分布"
          subtitle="自有品牌 · is_own_brand = 1"
          loading={query.isLoading}
          extra={<MetaLine source={review?.trend.source} asOf={review?.trend.asOf} />}
        >
          {review ? (
            <div style={{ paddingTop: 4 }}>
              <SentimentBlock items={review.sentiments} />
            </div>
          ) : null}
        </SectionCard>

        <SectionCard title="口碑走势" loading={query.isLoading}>
          {review ? (
            review.trend.status === "no_access" ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无权限查看评分走势" />
            ) : review.trend.ratingAvg.every((item) => item == null) ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="窗口内暂无评论数据" />
            ) : (
              <TrendChart
                height={196}
                labels={review.trend.labels}
                series={[
                  { name: "评论数", data: review.trend.reviewCount, type: "bar", axis: 0 },
                  { name: "星级均值", data: review.trend.ratingAvg, type: "line", axis: 1 },
                ]}
              />
            )
          ) : null}
        </SectionCard>
      </div>

      {/* 段三：评论主题 + 工单主题 */}
      <div className="grid-2col">
        <SectionCard
          title="评论主题"
          subtitle={review ? `Top ${Math.min(8, review.tags.length)}` : null}
          loading={query.isLoading}
          extra={review ? <MetaLine source={review.trend.source} asOf={review.trend.asOf} /> : null}
        >
          {review?.tags.length ? (
            <Table
              rowKey="tagName"
              size="small"
              pagination={false}
              dataSource={review.tags.slice(0, 8)}
              columns={[
                {
                  title: "主题",
                  dataIndex: "tagName",
                  render: (value: string) => <span className="cell-title">{value}</span>,
                },
                {
                  title: "情感",
                  dataIndex: "sentiment",
                  width: 78,
                  render: (value: string | null) =>
                    value ? <Tag>{value}</Tag> : <StateTag status="empty" compact />,
                },
                { title: "提及", dataIndex: "count", width: 62, align: "right" },
                {
                  title: "占比",
                  dataIndex: "ratio",
                  width: 132,
                  render: (value: number) => (
                    <Progress percent={Math.round(value * 100)} size="small" strokeColor="#1F8A4C" />
                  ),
                },
              ]}
            />
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无评论标签" />
          )}
        </SectionCard>

        <SectionCard
          title="服务工单主题"
          subtitle={tickets ? `${tickets.topics.length} 个主题` : null}
          loading={query.isLoading}
          extra={
            tickets ? (
              <span className="section-note">
                工单总数 <span className="num">{tickets.total}</span>
              </span>
            ) : null
          }
        >
          <Table<Topic>
            rowKey={(row) => `${row.topic}-${row.vocType ?? ""}`}
            size="small"
            pagination={false}
            dataSource={(tickets?.topics ?? []).slice(0, 8)}
            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="窗口内暂无工单主题" /> }}
            columns={[
              {
                title: "主题",
                dataIndex: "topic",
                render: (value: string) => <span className="cell-title">{value}</span>,
              },
              {
                title: "类型",
                dataIndex: "vocType",
                width: 100,
                render: (value: string | null) =>
                  value ?? <StateTag status="empty" compact />,
              },
              { title: "工单", dataIndex: "ticketCount", width: 62, align: "right" },
              {
                title: "占比",
                dataIndex: "ratio",
                width: 132,
                render: (value: number) => (
                  <Progress percent={Math.round(value * 100)} size="small" strokeColor="#1F8A4C" />
                ),
              },
            ]}
          />
          {tickets ? (
            <MetaLine source={tickets.source} asOf={tickets.asOf} extra={tickets.note} />
          ) : null}
        </SectionCard>
      </div>

      {/* 段四：竞品口碑 */}
      <SectionCard
        title="竞品口碑"
        subtitle={competitors ? `${competitors.rows.length} 行` : null}
        flush
        loading={query.isLoading}
        extra={
          competitors ? <span className="section-note">{competitors.note ?? "仅 is_own_brand = 0"}</span> : null
        }
      >
        <Table<Competitor>
          rowKey={(row) => `${row.brandName}-${row.vocModel ?? ""}`}
          size="small"
          dataSource={competitors?.rows ?? []}
          pagination={competitors && competitors.rows.length > 10 ? { pageSize: 10 } : false}
          locale={{ emptyText: <Empty description="未匹配到该商品的竞品行" /> }}
          columns={[
            {
              title: "品牌",
              dataIndex: "brandName",
              render: (value: string) => <span className="cell-title">{value}</span>,
            },
            {
              title: "型号",
              dataIndex: "vocModel",
              render: (value: string | null) => value ?? <StateTag status="empty" compact />,
            },
            {
              title: "星级均值",
              dataIndex: "ratingAvg",
              width: 110,
              align: "right",
              render: (value: number | null) =>
                value == null ? (
                  <StateTag status="empty" compact />
                ) : (
                  <span className="num">{value.toFixed(2)}</span>
                ),
            },
            {
              title: "评论数",
              dataIndex: "reviewCount",
              width: 110,
              align: "right",
              render: (value: number | null) =>
                value == null ? (
                  <StateTag status="empty" compact />
                ) : (
                  <span className="num">{value}</span>
                ),
            },
          ]}
        />
        {competitors ? <MetaLine source={competitors.source} asOf={competitors.asOf} /> : null}
      </SectionCard>
    </div>
  );
}

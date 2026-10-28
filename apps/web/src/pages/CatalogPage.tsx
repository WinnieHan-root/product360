import { useQuery } from "@tanstack/react-query";
import { Button, Empty, Select, Space, Table, Tag, Tooltip } from "antd";
import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CATALOG_SORTS, COVERAGE_DIMENSIONS, SPU_STATES } from "@product360/shared";
import { fetchBrands, fetchCategories, fetchProducts } from "../api/client";
import type { DataStatus, ProductListItem, ScopeInfo } from "../api/types";
import { DataValue } from "../components/DataValue";
import { DistributionBar } from "../components/DistributionBar";
import { MetricCard } from "../components/Field";
import { MiniChart } from "../components/MiniChart";
import { SectionCard } from "../components/SectionCard";
import { StateTag } from "../components/State";

const STATE_COLOR: Record<number, string> = {
  0: "default",
  1: "blue",
  2: "green",
  3: "orange",
  5: "red",
};

/** 分布图配色与状态标签保持一致，避免同一状态两种颜色 */
const STATE_CHART_COLOR: Record<number, string> = {
  0: "#98A2B3",
  1: "#3B82F6",
  2: "#1F8A4C",
  3: "#F59E0B",
  5: "#C11574",
};

/** 覆盖度 0→4 由浅到深，和表格里的四格条同源 */
const COVERAGE_COLOR = ["#D0D5DD", "#A6D5BB", "#6FBF95", "#3EA470", "#1F8A4C"];

/** 聚合计数直接来自后端 GROUP BY，不是估算值；缺失时按 empty 展示 */
function countField(value: number | undefined) {
  const status: DataStatus = value == null ? "empty" : "ready";
  return { status, source: null, asOf: null, value: value ?? null };
}

const SCOPE_TEXT: Record<ScopeInfo["mode"], string> = {
  all: "全部商品",
  brand: "品牌范围",
  category: "类目范围",
  mixed: "品牌 + 类目范围",
  none: "无可见范围",
};

function scopeSummary(scope: ScopeInfo | undefined) {
  if (!scope) return "";
  if (scope.mode === "all") return "范围：全部商品";
  const parts = [...scope.brands, ...scope.categories];
  return `范围：${SCOPE_TEXT[scope.mode]}（${parts.join("、")}）`;
}

function CoverageCell({ row }: { row: ProductListItem }) {
  const missing = COVERAGE_DIMENSIONS.filter(
    (item) => !row.coverageDimensions.includes(item.key),
  ).map((item) => item.label);
  return (
    <Tooltip title={missing.length ? `缺少：${missing.join("、")}` : "四项数据齐全"}>
      <span className="coverage">
        <span className="coverage__bars">
          {COVERAGE_DIMENSIONS.map((item) => (
            <span
              key={item.key}
              className={`coverage__bar${
                row.coverageDimensions.includes(item.key) ? " coverage__bar--on" : ""
              }`}
            />
          ))}
        </span>
        <span className="coverage__value">{row.coverage}/4</span>
      </span>
    </Tooltip>
  );
}

export function CatalogPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const queryKey = params.toString();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["products", queryKey],
    queryFn: () =>
      fetchProducts({
        q: params.get("q") ?? undefined,
        brand: params.get("brand") ?? undefined,
        category: params.get("category") ?? undefined,
        state: params.get("state") ?? undefined,
        sort: params.get("sort") ?? undefined,
        page: params.get("page") ?? undefined,
        pageSize: params.get("pageSize") ?? undefined,
      }),
  });
  const brands = useQuery({ queryKey: ["brands"], queryFn: fetchBrands });
  const categories = useQuery({ queryKey: ["categories"], queryFn: fetchCategories });

  useEffect(() => {
    const scroller = document.getElementById("app-content");
    const saved = sessionStorage.getItem(`catalog-scroll:${queryKey}`);
    if (scroller && saved) scroller.scrollTop = Number(saved);
  }, [queryKey]);

  function update(next: Record<string, string | undefined>, resetPage = true) {
    const scroller = document.getElementById("app-content");
    if (scroller) sessionStorage.setItem(`catalog-scroll:${queryKey}`, String(scroller.scrollTop));
    const merged = new URLSearchParams(params);
    for (const [key, value] of Object.entries(next)) {
      merged.delete(key);
      if (value) merged.set(key, value);
    }
    if (resetPage) merged.delete("page");
    setParams(merged);
  }

  function rememberScroll() {
    const scroller = document.getElementById("app-content");
    if (scroller) sessionStorage.setItem(`catalog-scroll:${queryKey}`, String(scroller.scrollTop));
  }

  const summary = data?.summary;
  const breakdown = data?.breakdown;
  const stateData = (breakdown?.state ?? []).map((item) => ({
    label: item.label,
    value: item.count,
    color: STATE_CHART_COLOR[item.code],
  }));
  const coverageItems = (breakdown?.coverage ?? []).map((item) => ({
    label: `${item.level} 项`,
    value: item.count,
    color: COVERAGE_COLOR[item.level] ?? COVERAGE_COLOR[0],
  }));
  const topBrands = [...(brands.data ?? [])]
    .sort((a, b) => b.spuCount - a.spuCount)
    .slice(0, 6)
    .map((item) => ({ label: item.name, value: item.spuCount }));

  return (
    <div className="page-stack">
      <div className="scope-bar">
        <Space wrap size={8}>
          <Select
            allowClear
            placeholder="品牌"
            style={{ minWidth: 150 }}
            value={params.get("brand") ?? undefined}
            options={(brands.data ?? []).map((item) => ({
              value: item.code,
              label: `${item.name}（${item.spuCount}）`,
            }))}
            onChange={(value) => update({ brand: value })}
          />
          <Select
            allowClear
            placeholder="一级类目"
            style={{ minWidth: 170 }}
            value={params.get("category") ?? undefined}
            options={(categories.data ?? []).map((item) => ({
              value: item.code,
              label: `${item.name}（${item.spuCount}）`,
            }))}
            onChange={(value) => update({ category: value })}
          />
          <Select
            allowClear
            placeholder="商品状态"
            style={{ minWidth: 140 }}
            value={params.get("state") ?? undefined}
            options={SPU_STATES.map((item) => ({ value: String(item.code), label: item.label }))}
            onChange={(value) => update({ state: value })}
          />
          <Select
            style={{ width: 160 }}
            value={params.get("sort") ?? "coverage"}
            options={CATALOG_SORTS.map((item) => ({ value: item.value, label: item.label }))}
            onChange={(value) => update({ sort: value })}
          />
          <Button onClick={() => setParams(new URLSearchParams())}>清除筛选</Button>
        </Space>
        {data ? <span className="scope-bar__chip">{scopeSummary(data.scope)}</span> : null}
      </div>

      <div className="metric-row">
        <MetricCard label="当前范围商品" field={countField(summary?.total)} />
        <MetricCard label="有 SKU 或渠道明细" field={countField(summary?.withDetail)} />
        <MetricCard label="四项数据齐全" field={countField(summary?.fullCoverage)} />
        <MetricCard label="近 30 天有销量" field={countField(summary?.withSales)} />
        <MetricCard label="有口碑数据" field={countField(summary?.withReview)} />
      </div>

      <div className="chart-band">
        <SectionCard title="状态分布" subtitle={`同当前筛选 · 共 ${summary?.total ?? 0}`}>
          <MiniChart kind="donut" data={stateData} height={116} />
        </SectionCard>
        <SectionCard title="数据覆盖度" subtitle="SKU / 渠道 / 销量 / 口碑">
          <div style={{ paddingTop: 6 }}>
            <DistributionBar items={coverageItems} unit=" 个" height={12} />
          </div>
        </SectionCard>
        <SectionCard title="品牌分布" subtitle="Top 6 · 权限范围">
          <MiniChart kind="hbar" data={topBrands} height={116} />
        </SectionCard>
      </div>

      <SectionCard flush title="商品列表" subtitle={`共 ${summary?.total ?? 0} 条`}>
        <Table<ProductListItem>
          rowKey="spuCode"
          tableLayout="fixed"
          loading={isLoading}
          dataSource={data?.items ?? []}
          locale={{ emptyText: isError ? "加载失败" : <Empty description="未找到商品" /> }}
          pagination={{
            current: data?.page ?? 1,
            pageSize: data?.pageSize ?? 20,
            total: data?.total ?? 0,
            showSizeChanger: true,
            pageSizeOptions: [20, 50, 100],
            showTotal: (total) => `共 ${total} 条`,
            style: { paddingRight: 16 },
            onChange: (page, pageSize) =>
              update({ page: String(page), pageSize: String(pageSize) }, false),
          }}
          columns={[
            {
              title: "商品",
              dataIndex: "spuName",
              width: 236,
            render: (_, row) => (
              <div style={{ display: "flex", gap: 10, minWidth: 0 }}>
                <div
                  className="product-thumb"
                  style={
                    row.spuImage
                      ? { backgroundImage: `url(${row.spuImage})`, backgroundSize: "cover" }
                      : undefined
                  }
                >
                  {row.spuImage ? null : "无图"}
                </div>
                <div style={{ minWidth: 0, flex: "1 1 auto" }}>
                  <div className="cell-title">
                    {row.spuName}
                    {row.spuLevelNew ? (
                      <Tag
                        style={{ marginLeft: 6 }}
                        color={row.spuLevelNew === "A" ? "green" : undefined}
                      >
                        {row.spuLevelNew}
                      </Tag>
                    ) : null}
                  </div>
                  <Tooltip title={row.spuNameEn ?? ""}>
                    <div className="cell-sub">{row.spuNameEn ?? "无英文名"}</div>
                  </Tooltip>
                  <div className="cell-sub">{row.spuCode}</div>
                </div>
              </div>
            ),
          },
          {
            title: "品牌 / 类目",
            width: 132,
            render: (_, row) => (
              <div>
                <div className="cell-title">{row.brandCode ?? <StateTag status="empty" compact />}</div>
                <Tooltip title={row.categoryPath}>
                  <div className="cell-sub">{row.categoryPath || "暂无类目"}</div>
                </Tooltip>
              </div>
            ),
          },
          {
            title: "状态",
            width: 74,
            render: (_, row) => <Tag color={STATE_COLOR[row.spuState]}>{row.spuStateLabel}</Tag>,
          },
          {
            title: "SKU / 渠道",
            width: 88,
            align: "right",
            render: (_, row) => (
              <Tooltip title={`${row.skuCount} 个 SKU · ${row.channelCount} 个渠道`}>
                <span className="num">
                  {row.skuCount} · {row.channelCount}
                </span>
              </Tooltip>
            ),
          },
          {
            title: "市场",
            width: 90,
            render: (_, row) =>
              row.marketCountries.length ? (
                <Tooltip title={row.marketCountries.join("、")}>
                  <span>
                    {row.marketCountries.slice(0, 2).join("、")}
                    {row.marketCountries.length > 2 ? ` +${row.marketCountries.length - 2}` : ""}
                  </span>
                </Tooltip>
              ) : (
                <StateTag status="empty" compact />
              ),
          },
          {
            title: "近 30 天销售额",
            width: 112,
            align: "right",
            render: (_, row) => <DataValue field={row.sales30dUsd} digits={2} prefix="$" compact />,
          },
          { title: "评论", dataIndex: "reviewCount", width: 56, align: "right" },
          { title: "覆盖度", width: 88, render: (_, row) => <CoverageCell row={row} /> },
          {
            title: "更新时间",
            dataIndex: "updateTime",
            width: 80,
            render: (value: string | null) => (
              <span className="num">{value ? value.slice(5, 10) : "—"}</span>
            ),
          },
          {
            title: "操作",
            width: 52,
            render: (_, row) => (
              <Button
                type="link"
                style={{ padding: 0 }}
                onClick={() => {
                  rememberScroll();
                  navigate(`/products/${row.spuCode}/overview`);
                }}
              >
                查看
              </Button>
            ),
          },
        ]}
          scroll={{ x: 1008 }}
        />
      </SectionCard>
    </div>
  );
}
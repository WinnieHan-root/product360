import { useQuery } from "@tanstack/react-query";
import { Alert, Card, Tag, Tabs, Typography } from "antd";
import { Link, Outlet, useLocation, useParams } from "react-router-dom";
import { fetchOverview } from "../api/client";
import { MetaLine } from "../components/DataValue";
import { QualityBadge } from "../components/QualityBadge";
import { fieldCompleteness } from "./OverviewPage";

export function ProductLayout() {
  const { spu = "" } = useParams();
  const location = useLocation();
  const query = useQuery({
    queryKey: ["overview", spu],
    queryFn: () => fetchOverview(spu),
    enabled: Boolean(spu),
    retry: false,
  });
  const tab = location.pathname.endsWith("/channels")
    ? "channels"
    : location.pathname.endsWith("/external")
      ? "external"
      : "overview";

  const header = query.data?.header;
  const completeness = fieldCompleteness(query.data);

  return (
    <div className="page-stack">
      <Link to="/products" className="section-note">
        ← 返回商品库
      </Link>
      <Card className="section-card" loading={query.isLoading}>
        {query.isError ? (
          <Alert
            type="error"
            showIcon
            message="无法查看这个商品"
            description="商品不存在，或当前账号没有这个商品所在品牌 / 类目的查看权限。"
          />
        ) : null}
        {header && (
          <div className="product-head">
            <div className="product-head__identity">
              <div
                className="product-thumb product-thumb--lg"
                style={
                  header.spuImage
                    ? { backgroundImage: `url(${header.spuImage})`, backgroundSize: "cover" }
                    : undefined
                }
              >
                {header.spuImage ? null : "无主图"}
              </div>
              <div style={{ minWidth: 0 }}>
                <Typography.Title level={4} style={{ margin: 0, fontSize: 18 }}>
                  {header.spuName}
                  {header.spuLevelNew ? (
                    <Tag
                      style={{ marginLeft: 8 }}
                      color={header.spuLevelNew === "A" ? "green" : undefined}
                    >
                      {header.spuLevelNew}
                    </Tag>
                  ) : null}
                </Typography.Title>
                <div className="section-note" style={{ marginTop: 4 }}>
                  SPU <span className="num">{header.spuCode}</span> ·{" "}
                  {header.brandCode ?? "品牌暂无数据"} · {header.categoryPath || "暂无类目"}
                </div>
                <div className="product-head__tags">
                  <Tag color="green">{header.spuStateLabel}</Tag>
                  {header.listingTime ? (
                    <span className="section-note num">
                      上架时间 {header.listingTime.slice(0, 10)}
                    </span>
                  ) : null}
                  <MetaLine source={header.source} asOf={header.asOf} />
                </div>
              </div>
            </div>

            <div className="head-status">
              <div className="head-status__card">
                <div className="head-status__label">字段接入</div>
                <div className="head-status__value num">{completeness.percent}%</div>
                <div className="head-status__sub num">
                  {completeness.readyCount}/{completeness.tracked.length}
                </div>
              </div>
              <div className="head-status__card">
                <div className="head-status__label">缺失项</div>
                <div className="head-status__value num">{completeness.missing.length}</div>
                <div className="head-status__sub">
                  {completeness.missing.length ? "见下方完整度" : "字段均已接入"}
                </div>
              </div>
              <div className="head-status__card">
                <div className="head-status__label">质量检查</div>
                <QualityBadge quality={query.data?.quality} />
              </div>
            </div>
          </div>
        )}
      </Card>
      <Tabs
        activeKey={tab}
        items={[
          { key: "overview", label: <Link to={`/products/${spu}/overview`}>概览</Link> },
          { key: "channels", label: <Link to={`/products/${spu}/channels`}>全渠道</Link> },
          { key: "external", label: <Link to={`/products/${spu}/external`}>外部信息</Link> },
        ]}
      />
      <Outlet />
    </div>
  );
}

import { useQuery } from "@tanstack/react-query";
import { Alert, Breadcrumb, Button, Card, Tabs, Tag, Tooltip, Typography } from "antd";
import { Link, Outlet, useLocation, useParams } from "react-router-dom";
import { fetchOverview } from "../api/client";
import { MetaLine } from "../components/DataValue";
import { QualityBadge } from "../components/QualityBadge";
import { fieldCompleteness } from "./OverviewPage";

const SOON_TIP = "第二期开放";
const READONLY_TIP = "第一期只读";

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
  const missing = completeness.missing;

  return (
    <div className="page-stack">
      <div className="breadcrumb-bar">
        <Breadcrumb
          items={[
            { title: <Link to="/products">商品总览</Link> },
            { title: <Link to="/products">公司商品主数据</Link> },
            {
              title: <span className="breadcrumb-current">{header?.spuName ?? "商品详情"}</span>,
            },
          ]}
        />
      </div>
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
              <div className="product-head__main">
                <Typography.Title level={4} style={{ margin: 0, fontSize: 20, lineHeight: 1.35 }}>
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
                <div className="product-head__fields">
                  <div className="field-pair">
                    <span className="field-pair__label">SPU</span>
                    <span className="field-pair__value num">{header.spuCode}</span>
                  </div>
                  {header.brandCode ? (
                    <div className="field-pair">
                      <span className="field-pair__label">品牌</span>
                      <span className="field-pair__value">{header.brandCode}</span>
                    </div>
                  ) : null}
                  {header.categoryPath ? (
                    <div className="field-pair">
                      <span className="field-pair__label">类目</span>
                      <span className="field-pair__value" title={header.categoryPath}>
                        {header.categoryPath}
                      </span>
                    </div>
                  ) : null}
                </div>
                <div className="product-head__tags">
                  {header.listingTime ? (
                    <span className="section-note num">
                      上架时间 {header.listingTime.slice(0, 10)}
                    </span>
                  ) : null}
                  <MetaLine source={header.source} asOf={header.asOf} />
                </div>
              </div>
            </div>

            <div className="product-head__side">
              <div className="head-actions">
                <Tag color="green">{header.spuStateLabel}</Tag>
                <Tooltip title={READONLY_TIP}>
                  <Button size="small" disabled>
                    编辑
                  </Button>
                </Tooltip>
                <Tooltip title={READONLY_TIP}>
                  <Button size="small" disabled>
                    更多操作
                  </Button>
                </Tooltip>
              </div>
              <div className="head-status">
                <div className="head-status__card">
                  <div className="head-status__label">主数据完整度</div>
                  <div className="head-status__value num">{completeness.percent}%</div>
                  <div className="head-status__sub num">
                    {completeness.readyCount}/{completeness.tracked.length} 项字段已接入
                  </div>
                </div>
                <div className="head-status__card">
                  <div className="head-status__label">缺失字段提醒</div>
                  {missing.length ? (
                    <>
                      <div className="head-status__sub">{missing.length} 项字段待完善</div>
                      <div className="head-status__list">
                        {missing.slice(0, 3).map((item) => (
                          <div className="head-status__item" key={item.label}>
                            · {item.label}
                          </div>
                        ))}
                        {missing.length > 3 ? (
                          <div className="head-status__more">还有 {missing.length - 3} 项</div>
                        ) : null}
                      </div>
                    </>
                  ) : (
                    <div className="head-status__sub">字段均已接入</div>
                  )}
                </div>
                <div className="head-status__card">
                  <div className="head-status__label">质量检查</div>
                  <QualityBadge quality={query.data?.quality} />
                  <div className="head-status__sub muted">审核状态 未接入</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </Card>
      <Tabs
        activeKey={tab}
        items={[
          { key: "overview", label: <Link to={`/products/${spu}/overview`}>基本信息</Link> },
          { key: "channels", label: <Link to={`/products/${spu}/channels`}>全渠道</Link> },
          { key: "external", label: <Link to={`/products/${spu}/external`}>外部信息</Link> },
          { key: "spec", label: <span title={SOON_TIP}>规格属性</span>, disabled: true },
          { key: "variants", label: <span title={SOON_TIP}>变体</span>, disabled: true },
          { key: "packaging", label: <span title={SOON_TIP}>包装配件</span>, disabled: true },
          { key: "related", label: <span title={SOON_TIP}>关联信息</span>, disabled: true },
          { key: "history", label: <span title={SOON_TIP}>变更历史</span>, disabled: true },
        ]}
      />
      <Outlet />
    </div>
  );
}

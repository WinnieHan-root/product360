import { useQuery } from "@tanstack/react-query";
import { Input, Layout, Menu } from "antd";
import type { MenuProps } from "antd";
import { useState } from "react";
import { Link, Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { fetchOverview } from "../api/client";

import { useAuth } from "../auth";

const { Header, Sider, Content } = Layout;

const SOON_TIP = "第二期开放";
const NEED_SPU_TIP = "请先选择商品";

/**
 * 侧栏导航，分组与顺序对齐设计稿。
 * 已实现项可点；未实现项置灰，title 提示「第二期开放」；
 * 依赖具体商品的项在没有 spu 时同样置灰，避免点了跳到空路由。
 */
function sidebarItems(spu: string | undefined): MenuProps["items"] {
  return [
    { key: "/products", label: <Link to="/products">商品总览</Link> },
    {
      key: "master-data",
      type: "group",
      label: "主数据",
      children: [
        spu
          ? {
              key: `/products/${spu}/overview`,
              label: <Link to={`/products/${spu}/overview`}>公司商品主数据</Link>,
            }
          : { key: "nospu:master", label: "公司商品主数据", disabled: true, title: NEED_SPU_TIP },
        { key: "soon:category", label: "类目管理", disabled: true, title: SOON_TIP },
        { key: "soon:attribute", label: "属性管理", disabled: true, title: SOON_TIP },
        { key: "soon:brand", label: "品牌管理", disabled: true, title: SOON_TIP },
      ],
    },
    spu
      ? { key: `/products/${spu}/channels`, label: <Link to={`/products/${spu}/channels`}>全渠道</Link> }
      : { key: "nospu:channels", label: "全渠道", disabled: true, title: NEED_SPU_TIP },
    { key: "soon:asset", label: "素材中心", disabled: true, title: SOON_TIP },
    spu
      ? { key: `/products/${spu}/external`, label: <Link to={`/products/${spu}/external`}>外部信息</Link> }
      : { key: "nospu:external", label: "外部信息", disabled: true, title: NEED_SPU_TIP },
    { key: "soon:ask", label: "问商品", disabled: true, title: SOON_TIP },
    { key: "soon:task", label: "任务中心", disabled: true, title: SOON_TIP },
    { key: "soon:dashboard", label: "数据看板", disabled: true, title: SOON_TIP },
    { key: "soon:issue", label: "数据问题", disabled: true, title: SOON_TIP },
    { key: "soon:monitor", label: "监控预警", disabled: true, title: SOON_TIP },
    { key: "soon:settings", label: "系统设置", disabled: true, title: SOON_TIP },
  ];
}

function selectedKey(pathname: string, spu: string | undefined) {
  if (!spu) return "/products";
  if (pathname.endsWith("/channels")) return `/products/${spu}/channels`;
  if (pathname.endsWith("/external")) return `/products/${spu}/external`;
  return `/products/${spu}/overview`;
}

export function AppShell() {
  const { user, logout } = useAuth();
  const [params] = useSearchParams();
  const [keyword, setKeyword] = useState(params.get("q") ?? "");
  const navigate = useNavigate();
  const location = useLocation();
  const spu = location.pathname.match(/^\/products\/([^/]+)/)?.[1];
  const overview = useQuery({
    queryKey: ["overview", spu ?? ""],
    queryFn: () => fetchOverview(spu ?? ""),
    enabled: Boolean(spu),
    retry: false,
  });
  const masterAsOf = overview.data?.header.asOf;

  return (
    <Layout style={{ minHeight: "100vh", minWidth: 1280 }}>
      <Header
        style={{
          height: 64,
          lineHeight: "64px",
          background: "var(--bg-card)",
          display: "flex",
          alignItems: "center",
          gap: 24,
          padding: "0 24px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div className="logo--header">商品中心</div>
        <div className="header-search">
          <Input.Search
            allowClear
            placeholder="搜索商品名称、SPU、SKU、ASIN、平台 SKU"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            onSearch={(value) => {
              const next = new URLSearchParams(
                location.pathname.startsWith("/products") && !location.pathname.split("/")[2]
                  ? params
                  : undefined,
              );
              if (value) next.set("q", value);
              else next.delete("q");
              next.delete("page");
              navigate(`/products?${next.toString()}`);
            }}
          />
        </div>
        <div className="header-right">
          {masterAsOf ? <span className="shell-asof">主数据 {masterAsOf}</span> : null}
          <span>
            {user?.name}
            {user && user.roleLabel !== user.name ? ` · ${user.roleLabel}` : ""}
          </span>
          <a
            onClick={() => {
              logout();
              navigate("/login");
            }}
          >
            退出
          </a>
        </div>
      </Header>
      <Layout>
        <Sider
          width={216}
          theme="light"
          style={{
            borderRight: "1px solid var(--border)",
            background: "var(--bg-card)",
            overflowY: "auto",
          }}
        >
          <Menu
            mode="inline"
            style={{ borderInlineEnd: "none", padding: "8px 8px 24px" }}
            selectedKeys={[selectedKey(location.pathname, spu)]}
            items={sidebarItems(spu)}
          />
        </Sider>
        <Content
          id="app-content"
          style={{
            padding: 24,
            overflow: "auto",
            height: "calc(100vh - 64px)",
            background: "var(--bg-page)",
          }}
        >
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}

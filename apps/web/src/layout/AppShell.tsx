import { Input, Layout, Menu } from "antd";
import { useState } from "react";
import { Link, Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { useAuth } from "../auth";

const { Header, Sider, Content } = Layout;

export function AppShell() {
  const { user, logout } = useAuth();
  const [params] = useSearchParams();
  const [keyword, setKeyword] = useState(params.get("q") ?? "");
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <Layout style={{ minHeight: "100vh", minWidth: 1280 }}>
      <Sider width={216} theme="light" style={{ borderRight: "1px solid var(--border)" }}>
        <div className="logo">商品中心</div>
        <Menu
          mode="inline"
          style={{ borderInlineEnd: "none", padding: "0 8px" }}
          selectedKeys={["products"]}
          items={[{ key: "products", label: <Link to="/products">商品库</Link> }]}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            height: 64,
            lineHeight: "64px",
            background: "var(--bg-card)",
            display: "flex",
            alignItems: "center",
            gap: 16,
            padding: "0 24px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <Input.Search
            allowClear
            placeholder="搜索商品名称、SPU、SKU、ASIN、平台 SKU"
            style={{ maxWidth: 520 }}
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            onSearch={(value) => {
              const next = new URLSearchParams(location.pathname.startsWith("/products") && !location.pathname.split("/")[2] ? params : undefined);
              if (value) next.set("q", value);
              else next.delete("q");
              next.delete("page");
              navigate(`/products?${next.toString()}`);
            }}
          />
          <div style={{ marginLeft: "auto", color: "var(--text-2)", fontSize: 13 }}>
            {user?.name}
            {user && user.roleLabel !== user.name ? ` · ${user.roleLabel}` : ""}
            <a
              style={{ marginLeft: 12 }}
              onClick={() => {
                logout();
                navigate("/login");
              }}
            >
              退出
            </a>
          </div>
        </Header>
        <Content id="app-content" style={{ padding: 24, overflow: "auto", height: "calc(100vh - 64px)" }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}

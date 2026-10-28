import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { AuthProvider } from "./auth";
import "antd/dist/reset.css";
import "./styles.css";

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: "#1f8a4c",
          colorLink: "#1f8a4c",
          colorBorderSecondary: "#eaecf0",
          colorSplit: "#eaecf0",
          colorBgLayout: "#f7f8fa",
          colorText: "#101828",
          colorTextSecondary: "#475467",
          colorTextTertiary: "#98a2b3",
          borderRadius: 8,
          borderRadiusLG: 10,
          controlHeight: 36,
          fontSize: 14,
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "PingFang SC", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        },
        components: {
          Layout: { siderBg: "#ffffff", headerBg: "#ffffff", bodyBg: "#f7f8fa" },
          Card: { paddingLG: 16, headerHeight: 44, headerFontSize: 14 },
          Table: {
            headerBg: "#f6f8fa",
            headerColor: "#475467",
            headerSplitColor: "transparent",
            cellPaddingBlock: 10,
            cellPaddingInline: 12,
            rowHoverBg: "#f9fafb",
          },
          Tabs: { horizontalItemGutter: 24, horizontalItemPadding: "10px 0" },
          Menu: { itemHeight: 40, itemBorderRadius: 8 },
          Tag: { defaultBg: "#f2f4f7", defaultColor: "#475467" },
        },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ConfigProvider>
  </StrictMode>,
);

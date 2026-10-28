import type { ReactElement } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth";
import { AppShell } from "./layout/AppShell";
import { CatalogPage } from "./pages/CatalogPage";
import { ChannelsPage } from "./pages/ChannelsPage";
import { ExternalPage } from "./pages/ExternalPage";
import { LoginPage } from "./pages/LoginPage";
import { OverviewPage } from "./pages/OverviewPage";
import { ProductLayout } from "./pages/ProductLayout";

function Private({ children }: { children: ReactElement }) {
  const { user, ready } = useAuth();
  if (!ready) return null;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <Private>
            <AppShell />
          </Private>
        }
      >
        <Route path="/products" element={<CatalogPage />} />
        <Route path="/products/:spu" element={<ProductLayout />}>
          <Route index element={<Navigate to="overview" replace />} />
          <Route path="overview" element={<OverviewPage />} />
          <Route path="channels" element={<ChannelsPage />} />
          <Route path="external" element={<ExternalPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/products" replace />} />
    </Routes>
  );
}

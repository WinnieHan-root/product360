import type { DataField, DataStatus, UserRole } from "@product360/shared";

export type { DataField, DataStatus };

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  roleLabel: string;
  canViewCommercial: boolean;
  scopes: { scopeType: string; scopeCode: string }[];
}

export interface MetaItem {
  code: string;
  name: string;
  spuCount: number;
}

export interface ScopeInfo {
  mode: "all" | "brand" | "category" | "mixed" | "none";
  brands: string[];
  categories: string[];
}

export interface ProductListItem {
  spuCode: string;
  spuName: string;
  spuNameEn: string | null;
  spuImage: string | null;
  brandCode: string | null;
  categoryNameL1: string | null;
  categoryPath: string;
  spuLevelNew: string | null;
  spuState: number;
  spuStateLabel: string;
  skuCount: number;
  channelCount: number;
  marketCountries: string[];
  sales30dUsd: DataField<number>;
  reviewCount: number;
  coverage: number;
  coverageDimensions: string[];
  updateTime: string | null;
}

export interface ProductBreakdown {
  state: { code: number; label: string; count: number }[];
  coverage: { level: number; count: number }[];
}

export interface ProductListResponse {
  items: ProductListItem[];
  total: number;
  page: number;
  pageSize: number;
  summary: {
    total: number;
    withDetail: number;
    fullCoverage: number;
    withSales: number;
    withReview: number;
  };
  /** 分布按「同筛选条件的全量」聚合，与当前页无关 */
  breakdown: ProductBreakdown;
  scope: ScopeInfo;
}

export interface FieldItem<T = string> {
  key: string;
  label: string;
  field: DataField<T>;
}

export interface PackagingValue {
  length: number | null;
  width: number | null;
  height: number | null;
  weight: number | null;
  netWeight: number | null;
  lengthUnit: string;
  weightUnit: string;
}

export interface CartonValue extends Omit<PackagingValue, "netWeight"> {
  num: number | null;
  netWeight?: number | null;
}

export interface VariantCode {
  channel: string;
  channelName: string | null;
  site: string | null;
  shopCode: string | null;
  platformSku: string | null;
  asin: string | null;
}

export interface Variant {
  skuCode: string;
  skuName: string;
  skuNameEn: string | null;
  skuImage: string | null;
  skuStateLabel: string;
  suggestPrice: DataField<number>;
  currency: string | null;
  codes: VariantCode[];
  unavailableCodes: { label: string; status: DataStatus }[];
}

export interface Overview {
  header: {
    spuCode: string;
    spuName: string;
    spuNameEn: string | null;
    spuImage: string | null;
    brandCode: string | null;
    categoryPath: string;
    spuLevelNew: string | null;
    spuStateLabel: string;
    listingTime: string | null;
    asOf: string | null;
    source: string;
    /** 跨页签指标带，来自 pd_spu 预聚合列 */
    metrics: {
      sales30dUsd: DataField<number>;
      ratingAvg: DataField<number>;
      skuCount: DataField<number>;
      channelCount: DataField<number>;
    };
  };
  fields: FieldItem[];
  tags: FieldItem[];
  packaging: {
    product: DataField<PackagingValue>;
    carton: DataField<CartonValue>;
  };
  variants: Variant[];
  variantsMeta: { total: number; source: string; asOf: string | null };
}

export interface ChannelRow {
  channel: string;
  channelName: string | null;
  site: string | null;
  shopCode: string | null;
  platformSku: string | null;
  asin: string | null;
  skuCode: string | null;
  listingStatus: DataField<string>;
  suggestPrice: DataField<number>;
  saleQty: DataField<number>;
  salesAmountUsd: DataField<number>;
  inStockQty: DataField<number>;
  onWayQty: DataField<number>;
}

export interface ChannelsResponse {
  window: { days: number; from: string; to: string };
  summary: FieldItem<number>[];
  rows: ChannelRow[];
  trend: {
    metrics: string[];
    labels: string[];
    saleQty: (number | null)[];
    salesAmountUsd: (number | null)[];
    status: DataStatus;
    source: string;
    asOf: string | null;
    note: string;
  };
}

export interface ExternalResponse {
  window: { days: number; from: string; to: string };
  review: {
    ratingAvg: DataField<number>;
    reviewCount: DataField<number>;
    sentiments: {
      bucket: number;
      sentiment: string;
      count: number | null;
      ratio: number | null;
    }[];
    sentimentStatus: DataStatus;
    tags: { tagName: string; sentiment: string | null; count: number; ratio: number }[];
    tagsStatus: DataStatus;
    trend: {
      labels: string[];
      ratingAvg: (number | null)[];
      reviewCount: (number | null)[];
      status: DataStatus;
      source: string;
      asOf: string | null;
    };
  };
  tickets: {
    status: DataStatus;
    total: number | null;
    topics: { topic: string; vocType: string | null; ticketCount: number; ratio: number }[];
    source: string;
    asOf: string | null;
    note: string;
  };
  competitors: {
    status: DataStatus;
    rows: {
      brandName: string;
      vocModel: string | null;
      ratingAvg: number | null;
      reviewCount: number | null;
    }[];
    source: string;
    asOf: string | null;
    note: string;
  };
}
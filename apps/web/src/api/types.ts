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

/** 四级类目树节点：value 是该级身份（编码优先，缺码时退化为名称） */
export interface CategoryNode {
  value: string;
  label: string;
  count: number;
  children?: CategoryNode[];
}

export interface CategoryTreeResponse {
  levels: number;
  total: number;
  tree: CategoryNode[];
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
  /** 运营生命周期：selling / prelaunch / clearance / retired，加载期算好 */
  lifecycleStage: string | null;
  lifecycleStageLabel: string | null;
  updateTime: string | null;
}

export interface ProductBreakdown {
  state: { code: number; label: string; count: number }[];
  coverage: { level: number; count: number }[];
  /** 市场分布：只列真实出现的市场码（不补 0），不受 market 自身筛选收窄 */
  markets: { code: string; count: number }[];
  /** 生命周期分布：固定 4 桶，缺的补 0 */
  lifecycle: { key: string; label: string; count: number }[];
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

/** P2-4：在线 listing 的一条明细（源表 ads_sal_sku_online_listing_df） */
export interface ListingItem {
  channel: string;
  site: string | null;
  shopCode: string | null;
  msku: string;
  externalId: string | null;
  externalIdType: string | null;
  parentExternalId: string | null;
  skuCode: string | null;
  title: DataField<string>;
  descriptionSummary: DataField<string>;
  mainImageUrl: DataField<string>;
  /** 源端已归一：online / offline / draft / deleted */
  listingStatus: string | null;
  /** 源端原值，用于解释归一结果（如「下架|正常」「active」） */
  listingStatusRaw: string | null;
  operatorName: string | null;
  currencyCode: string | null;
  listPrice: DataField<number>;
  salePrice: DataField<number>;
  rating: number | null;
  /** 内容完整度 0~5，源端已算好，不重算 */
  contentItemCnt: number | null;
  contentFlags: {
    title: boolean;
    mainImage: boolean;
    description: boolean;
    price: boolean;
    status: boolean;
  };
  productLink: string | null;
  srcTable: string | null;
}

/** P2-4：按渠道聚合，矩阵的列数据 */
export interface ListingChannelStat {
  channel: string;
  listingCount: number;
  shops: number;
  sites: string[];
  onlineCount: number;
  fullContentCount: number;
  contentAvg: number | null;
  missing: { title: number; image: number; description: number; price: number };
}

export interface ListingsResponse {
  spuCode: string;
  status: string;
  counts: { total: number; online: number; offline: number; draft: number; deleted: number };
  channels: ListingChannelStat[];
  items: ListingItem[];
  coverage: {
    channels: string[];
    srcTables: string[];
    note: string;
    status: DataStatus;
    source: string;
    asOf: string | null;
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
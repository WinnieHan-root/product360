/**
 * 前后端共享口径。
 * 字段与枚举全部取自 docs/sample_exports 的源表实际取值，不额外造枚举。
 */

export const DATA_STATUS = ["ready", "empty", "not_connected", "delayed", "no_access"] as const;
export type DataStatus = (typeof DATA_STATUS)[number];

export const DATA_STATUS_LABEL: Record<DataStatus, string> = {
  ready: "已就绪",
  empty: "暂无数据",
  not_connected: "未接入",
  delayed: "数据延迟",
  no_access: "无权限",
};

export const USER_ROLES = ["employee", "operator", "data_admin", "platform_admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const ROLE_LABEL: Record<UserRole, string> = {
  employee: "普通员工",
  operator: "商品运营",
  data_admin: "商品数据管理员",
  platform_admin: "平台管理员",
};

export const PAGE_SIZES = [20, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZES)[number];

/** 统一取值载体：状态、来源表、数据日期、值本身。no_access 时 value 恒为 null。 */
export interface DataField<T> {
  status: DataStatus;
  source: string | null;
  asOf: string | null;
  value: T | null;
}

/** pd_spu.spu_state 源枚举。空值在加载阶段归入「待上架」。 */
export const SPU_STATES = [
  { code: 0, label: "开发中" },
  { code: 1, label: "待上架" },
  { code: 2, label: "可销售" },
  { code: 3, label: "已下架" },
  { code: 5, label: "已取消" },
] as const;

export type SpuStateCode = (typeof SPU_STATES)[number]["code"];

export const SPU_STATE_LABEL: Record<number, string> = {
  0: "开发中",
  1: "待上架",
  2: "可销售",
  3: "已下架",
  5: "已取消",
};

/** pd_sku.sku_state 源枚举 */
export const SKU_STATE_LABEL: Record<number, string> = {
  0: "已取消",
  1: "未上架",
  2: "在销售",
  3: "清仓中",
  4: "已退市",
};

export const SPU_LEVELS = ["S", "A", "B", "C"] as const;

/** NPS 五档，顺序即展示顺序。bucket 与 sentiment 为源表 nps_overall_sentiment / sentiment_bucket。 */
export const NPS_SENTIMENTS = [
  { bucket: 1, sentiment: "强烈不推荐" },
  { bucket: 2, sentiment: "不喜欢" },
  { bucket: 3, sentiment: "一般" },
  { bucket: 4, sentiment: "喜欢" },
  { bucket: 5, sentiment: "强烈推荐" },
] as const;

/** 底表 → 中文来源名。作为 DataField.source 的取值。 */
export const SOURCE_TABLE_LABEL: Record<string, string> = {
  dim_pd_spu_info_df: "商品主档",
  dim_pd_sku_info_df: "SKU 主档",
  dim_sal_sku_info_df: "渠道商品编码",
  dws_sal_sku_statistics_td_df: "销售日汇总",
  dwb_scm_stock_channel_df: "渠道库存",
  dws_cs_voc_nps_review_df: "评论与 NPS",
  dwb_cs_voc_record_channel_hf: "服务工单",
  dwb_sal_return_sku_df: "退货明细",
};

/** 底表名（与 prisma schema 一致） */
export const BASE_TABLES = [
  "pd_spu",
  "pd_sku",
  "sal_sku_code",
  "sal_sku_day",
  "scm_stock",
  "voc_review_day",
  "voc_nps_tag",
  "voc_nps_sentiment",
  "voc_ticket_topic",
  "voc_competitor",
  "sync_batch",
] as const;
export type BaseTable = (typeof BASE_TABLES)[number];

/** 列表排序口径。coverage 为默认值：数据齐全的 SPU 优先。 */
export const CATALOG_SORTS = [
  { value: "coverage", label: "数据完整度优先" },
  { value: "updateTime", label: "最近更新" },
  { value: "sales30d", label: "近 30 天销售额" },
  { value: "reviewCount", label: "评论量" },
] as const;
export type CatalogSort = (typeof CATALOG_SORTS)[number]["value"];

/** 覆盖度 0-4 的含义：SKU / 渠道编码 / 销量 / 口碑 */
export const COVERAGE_DIMENSIONS = [
  { key: "sku", label: "SKU" },
  { key: "channel", label: "渠道" },
  { key: "sales", label: "销量" },
  { key: "voc", label: "口碑" },
] as const;

/** 第一期只做只读查看，任何写操作入口都不应出现。 */
export const READONLY_PHASE1 = true;

import { Injectable } from "@nestjs/common";
import type { DataStatus } from "@product360/shared";
import { SOURCE_TABLE_LABEL } from "@product360/shared";
import { dayKey } from "../common/field";
import { PrismaService } from "../common/prisma.service";
import { SourceService } from "../common/source.service";

const SPU_TABLE = "dim_pd_spu_info_df";
const SKU_TABLE = "dim_pd_sku_info_df";
const LISTING_TABLE = "ads_sal_sku_online_listing_df";
const DAY_TABLE = "dws_sal_sku_statistics_td_df";

export type QualitySeverity = "high" | "medium" | "low";

export const QUALITY_SEVERITY_WEIGHT: Record<QualitySeverity, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

export interface QualityIssue {
  key: string;
  label: string;
  severity: QualitySeverity;
  /** ready = 已评估（count 可信）；not_connected = 校验前提不成立，count 必须为 null */
  status: DataStatus;
  count: number | null;
  detail: string;
  samples: string[];
  source: string;
  asOf: string | null;
}

/** 详情页质量告警：全部现算，不接 Dataphin 巡检链路。 */
@Injectable()
export class QualityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sources: SourceService,
  ) {}

  /**
   * 5 条判定里有 3 条要跨表引用（listing→pd_sku、销量→pd_sku）。
   * 抽样环境下这些引用会大面积断裂，不能把「主档没抽到」误报成「映射错误」，
   * 所以每条跨表判定都带一个「可评估性前提」：前提不成立就报 not_connected 而不是 0。
   */
  async issues(spuCode: string) {
    const [stampSpu, stampSku, stampListing, stampDay] = await Promise.all([
      this.sources.stamp(SPU_TABLE),
      this.sources.stamp(SKU_TABLE),
      this.sources.stamp(LISTING_TABLE),
      this.sources.stamp(DAY_TABLE),
    ]);
    const spuSource = SOURCE_TABLE_LABEL[SPU_TABLE];
    const skuSource = SOURCE_TABLE_LABEL[SKU_TABLE];
    const listingSource = SOURCE_TABLE_LABEL[LISTING_TABLE];
    const daySource = SOURCE_TABLE_LABEL[DAY_TABLE];

    const [product, skus, listings] = await Promise.all([
      this.prisma.pdSpu.findUniqueOrThrow({ where: { spuCode } }),
      this.prisma.pdSku.findMany({ where: { spuCode }, select: { skuCode: true, skuStateDesc: true, ds: true } }),
      this.prisma.salSkuOnlineListing.findMany({
        where: { spuCode },
        select: {
          skuCode: true,
          listingStatus: true,
          hasTitle: true,
          hasMainImage: true,
          hasDescription: true,
          msku: true,
        },
      }),
    ]);

    const spuAsOf = dayKey(product.ds);
    const skuAsOf = skus.length ? dayKey(skus[0].ds) : stampSku.asOf;
    const listingAsOf = stampListing.asOf;
    const masterSkuCodes = new Set(skus.map((sku) => sku.skuCode));
    const onlineListings = listings.filter((row) => row.listingStatus === "online");

    /** 主档覆盖率：该 SPU 的在线 listing 引用的 SKU 中，有多少能在 pd_sku 找到。 */
    const listedSkuCodes = [
      ...new Set(onlineListings.map((row) => row.skuCode).filter((code): code is string => !!code)),
    ];
    const coveredListed = listedSkuCodes.filter((code) => masterSkuCodes.has(code));
    const masterGate = masterSkuCodes.size > 0 && listedSkuCodes.length > 0;

    const issues: QualityIssue[] = [];

    // ---- 1. 在售 listing 无内部编码 ----
    // 实测：sku_code 为空的行 spu_code 也一定为空，这类行落不到任何商品页，
    // 因此对单个 SPU 永远为 0。如实标 not_connected，说明它属于全局质检口径。
    issues.push({
      key: "no_mapping_online",
      label: "在售 listing 无内部编码",
      severity: "medium",
      status: "not_connected",
      count: null,
      detail:
        "sku_code 为空的 listing 同时没有 spu_code，无法归属到具体商品，只能在全局质检页统计",
      samples: [],
      source: listingSource,
      asOf: listingAsOf,
    });

    // ---- 2. 映射的 SKU 不在主数据 ----
    if (!masterGate) {
      issues.push({
        key: "mapping_sku_missing",
        label: "映射的 SKU 不在主数据",
        severity: "high",
        status: "not_connected",
        count: null,
        detail:
          masterSkuCodes.size === 0
            ? "该商品在 SKU 主数据中没有记录，无法比对映射是否正确"
            : "该商品没有在线 listing 引用内部 SKU，无从比对",
        samples: [],
        source: listingSource,
        asOf: listingAsOf,
      });
    } else {
      const missing = listedSkuCodes.filter((code) => !masterSkuCodes.has(code));
      issues.push({
        key: "mapping_sku_missing",
        label: "映射的 SKU 不在主数据",
        severity: "high",
        status: "ready",
        count: missing.length,
        detail:
          missing.length === 0
            ? `${coveredListed.length}/${listedSkuCodes.length} 个在线 SKU 均可在主数据中找到`
            : `${missing.length}/${listedSkuCodes.length} 个在线 SKU 在主数据中找不到${
                coveredListed.length < listedSkuCodes.length
                  ? `；主档仅覆盖 ${coveredListed.length}/${listedSkuCodes.length}，无法区分「映射错误」与「主档缺失」`
                  : ""
              }`,
        samples: missing.slice(0, 8),
        source: listingSource,
        asOf: listingAsOf,
      });
    }

    // ---- 3. 在售商品缺关键角色 ----
    // 只对「可销售」状态判定：开发中/待上架的商品本来就不该配齐角色。
    const roleFields = [
      { key: "productLeaderName", label: "产品负责人" },
      { key: "plannerName", label: "计划人员" },
      { key: "gtmName", label: "GTM" },
    ] as const;
    const missingRoles = roleFields.filter((item) => {
      const raw = product[item.key];
      return !raw || !raw.trim();
    });
    const sellable = product.spuStateDesc === "可销售";
    issues.push({
      key: "missing_active_role",
      label: "在售商品缺关键角色",
      severity: "high",
      status: sellable ? "ready" : "not_connected",
      count: sellable ? missingRoles.length : null,
      detail: sellable
        ? missingRoles.length === 0
          ? "产品负责人 / 计划人员 / GTM 均已配置"
          : `缺少 ${missingRoles.map((item) => item.label).join("、")}（只能判断是否配置，无法判断是否在职）`
        : `当前状态「${product.spuStateDesc ?? "未知"}」不属于可销售，未做角色完整性判定`,
      samples: sellable ? missingRoles.map((item) => item.label) : [],
      source: spuSource,
      asOf: spuAsOf,
    });

    // ---- 4. 有销量但非在售 ----
    if (masterSkuCodes.size === 0) {
      issues.push({
        key: "sales_not_on_sale",
        label: "有销量但 SKU 非在售",
        severity: "medium",
        status: "not_connected",
        count: null,
        detail: "该商品在 SKU 主数据中没有记录，无法取得 SKU 状态",
        samples: [],
        source: daySource,
        asOf: stampDay.asOf,
      });
    } else {
      const salesRows = await this.prisma.salSkuDay.groupBy({
        by: ["skuCode"],
        where: {
          spuCode,
          saleQty: { gt: 0 },
          orderDate: { gt: new Date(Date.now() - 30 * 86_400_000) },
          skuCode: { in: [...masterSkuCodes] },
        },
        _sum: { saleQty: true },
      });
      const stateByCode = new Map(skus.map((sku) => [sku.skuCode, sku.skuStateDesc]));
      const conflicts = salesRows.filter((row) => {
        const state = row.skuCode ? stateByCode.get(row.skuCode) : null;
        return (state ?? "") !== "在销售";
      });
      issues.push({
        key: "sales_not_on_sale",
        label: "有销量但 SKU 非在售",
        severity: "medium",
        status: "ready",
        count: conflicts.length,
        detail:
          salesRows.length === 0
            ? "近 30 天该商品没有产生销量的 SKU，无需比对状态"
            : conflicts.length === 0
              ? `近 30 天有销量的 ${salesRows.length} 个 SKU 状态均为「在销售」`
              : `近 30 天有销量的 ${salesRows.length} 个 SKU 中，${conflicts.length} 个状态不是「在销售」`,
        samples: conflicts
          .slice(0, 8)
          .map((row) => `${row.skuCode}（${stateByCode.get(row.skuCode ?? "") ?? "状态缺失"}）`),
        source: daySource,
        asOf: stampDay.asOf,
      });
    }

    // ---- 5. 在线 listing 内容缺口 ----
    // 只看 listing 表自身的 has_* 标记，不跨表，任何数据完整度下都可信。
    const contentGaps = onlineListings.filter(
      (row) => !row.hasTitle || !row.hasMainImage || !row.hasDescription,
    );
    issues.push({
      key: "listing_content_gap",
      label: "在线 listing 内容不完整",
      severity: "low",
      status: onlineListings.length ? "ready" : "not_connected",
      count: onlineListings.length ? contentGaps.length : null,
      detail: onlineListings.length
        ? contentGaps.length === 0
          ? `${onlineListings.length} 条在线 listing 标题、主图、描述均已填写`
          : `${onlineListings.length} 条在线 listing 中 ${contentGaps.length} 条缺${
              [
                contentGaps.some((row) => !row.hasTitle) ? "标题" : "",
                contentGaps.some((row) => !row.hasMainImage) ? "主图" : "",
                contentGaps.some((row) => !row.hasDescription) ? "描述" : "",
              ]
                .filter(Boolean)
                .join("/") || "内容"
            }`
        : "该商品没有在线 listing，无从判断内容完整性",
      samples: contentGaps.slice(0, 8).map((row) => row.msku),
      source: listingSource,
      asOf: listingAsOf,
    });

    const active = issues.filter((issue) => issue.status === "ready" && (issue.count ?? 0) > 0);
    return {
      /** 有问题的判定条数（不含 not_connected 与 0 命中） */
      total: active.length,
      high: active.filter((issue) => issue.severity === "high").length,
      medium: active.filter((issue) => issue.severity === "medium").length,
      low: active.filter((issue) => issue.severity === "low").length,
      /** 已评估 / 共几条；让前端能说「检查了 3 项，2 项有问题」 */
      evaluated: issues.filter((issue) => issue.status === "ready").length,
      checked: issues.length,
      /** 主档覆盖率：跨表判定是否可信的分母 */
      masterCoverage: {
        covered: coveredListed.length,
        total: listedSkuCodes.length,
      },
      issues,
    };
  }
}
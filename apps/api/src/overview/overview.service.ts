import { Injectable } from "@nestjs/common";
import type { DataStatus } from "@product360/shared";
import { SKU_STATE_LABEL, SOURCE_TABLE_LABEL, SPU_STATE_LABEL } from "@product360/shared";
import { AccessService } from "../common/access.service";
import type { AuthUser } from "../common/auth-user";
import { categoryPath, commercial, dayKey, field, num } from "../common/field";
import { PrismaService } from "../common/prisma.service";
import { SourceService, type SourceStamp } from "../common/source.service";

const SPU_TABLE = "dim_pd_spu_info_df";
const SKU_TABLE = "dim_pd_sku_info_df";
const SPU_SOURCE = SOURCE_TABLE_LABEL[SPU_TABLE];
const SKU_SOURCE = SOURCE_TABLE_LABEL[SKU_TABLE];

/** 源表没有的编码一律 not_connected，不填空白、不猜值。 */
const UNAVAILABLE_CODES = ["UPC", "EAN", "GTIN", "Item ID"].map((label) => ({
  label,
  status: "not_connected" as const,
}));

const FIELDS = [
  { key: "spuModelName", label: "型号" },
  { key: "spuProductTypeDesc", label: "产品类型" },
  { key: "productLineName", label: "产品线" },
  { key: "gtmName", label: "GTM" },
  { key: "productLeaderName", label: "产品负责人" },
  { key: "sellingPoint", label: "核心卖点" },
  { key: "spuDesc", label: "商品描述" },
] as const;

const TAGS = [
  { key: "senceTagName", label: "场景标签" },
  { key: "fmcgTagName", label: "快消标签" },
  { key: "iotTagName", label: "IoT 标签" },
  { key: "isElectricalDesc", label: "电器属性" },
  { key: "classTagName", label: "类别标签" },
  { key: "categoryTagName", label: "类目标签" },
] as const;

type TextKey = (typeof FIELDS)[number]["key"] | (typeof TAGS)[number]["key"];

@Injectable()
export class OverviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly sources: SourceService,
  ) {}

  /** 值存在即 ready（批次过期会被 SourceService 改判 delayed），为空即 empty。 */
  private value<T>(
    source: string,
    at: Date | string | null,
    value: T | null,
    stamp: SourceStamp,
  ) {
    const status: DataStatus = value == null ? "empty" : this.sources.resolve("ready", stamp);
    return field(status, source, at, value);
  }

  async get(spu: string, user: AuthUser) {
    const spuCode = await this.access.requireProduct(spu, user);
    const [stampSpu, stampSku] = await Promise.all([
      this.sources.stamp(SPU_TABLE),
      this.sources.stamp(SKU_TABLE),
    ]);

    const product = await this.prisma.pdSpu.findUniqueOrThrow({ where: { spuCode } });
    const skus = await this.prisma.pdSku.findMany({
      where: { spuCode },
      orderBy: { skuCode: "asc" },
    });
    const skuCodes = skus.map((sku) => sku.skuCode);
    const codeRows = skuCodes.length
      ? await this.prisma.salSkuCode.findMany({
          where: { skuCode: { in: skuCodes } },
          orderBy: [{ channel: "asc" }, { site: "asc" }, { saleSkuCode: "asc" }],
        })
      : [];
    const codesBySku = new Map<string, typeof codeRows>();
    for (const row of codeRows) {
      if (!row.skuCode) continue;
      const list = codesBySku.get(row.skuCode) ?? [];
      list.push(row);
      codesBySku.set(row.skuCode, list);
    }

    const asOf = dayKey(product.ds);
    const text = (key: TextKey) => {
      const raw = product[key];
      const value = raw?.trim() ? raw.trim() : null;
      return this.value(SPU_SOURCE, asOf, value, stampSpu);
    };

    // 包装尺寸取「第一个填了主规格的 SKU」，同一 SPU 多 SKU 时只展示代表值
    const packagingSku =
      skus.find((sku) => sku.specProductLength || sku.specProductWeight || sku.specCartonLength) ??
      skus[0];
    const packagingAsOf = packagingSku?.updateTime ?? asOf;
    const productPackaging = packagingSku
      ? {
          length: num(packagingSku.specProductLength),
          width: num(packagingSku.specProductWidth),
          height: num(packagingSku.specProductHeight),
          weight: num(packagingSku.specProductWeight),
          netWeight: num(packagingSku.specProductNetWeight),
          lengthUnit: "cm",
          weightUnit: "kg",
        }
      : null;
    const cartonPackaging = packagingSku
      ? {
          length: num(packagingSku.specCartonLength),
          width: num(packagingSku.specCartonWidth),
          height: num(packagingSku.specCartonHeight),
          weight: num(packagingSku.specCartonWeight),
          num: packagingSku.specCartonNum,
          lengthUnit: "cm",
          weightUnit: "kg",
        }
      : null;
    const anyFilled = (value: Record<string, unknown> | null) =>
      Boolean(
        value &&
          ["length", "width", "height", "weight"].some(
            (key) => value[key] !== null && value[key] !== undefined,
          ),
      );

    // 有渠道编码的变体排在前面，避免第一屏全是空编码行（不改数据，只调展示顺序）
    skus.sort(
      (a, b) =>
        (codesBySku.get(b.skuCode)?.length ?? 0) - (codesBySku.get(a.skuCode)?.length ?? 0) ||
        a.skuCode.localeCompare(b.skuCode),
    );

    return {
      header: {
        spuCode: product.spuCode,
        spuName: product.spuName,
        spuNameEn: product.spuNameEn,
        spuImage: product.spuImage,
        brandCode: product.brandCode,
        categoryPath: categoryPath([
          product.categoryNameL1,
          product.categoryNameL2,
          product.categoryNameL3,
          product.categoryNameL4,
          product.categoryNameL5,
        ]),
        spuLevelNew: product.spuLevelNew,
        spuStateLabel: SPU_STATE_LABEL[product.spuState] ?? product.spuStateDesc ?? "未知状态",
        listingTime: product.listingTime ? dayKey(product.listingTime) : null,
        asOf,
        source: SPU_SOURCE,
        /** 跨页签指标带：直接用 pd_spu 预聚合列（与列表页同源），不额外查表 */
        metrics: {
          sales30dUsd: commercial(
            user,
            product.sales30dUsd == null ? "empty" : "ready",
            SPU_SOURCE,
            asOf,
            product.sales30dUsd == null ? null : Number(product.sales30dUsd),
          ),
          ratingAvg: commercial(
            user,
            product.ratingAvg == null ? "empty" : "ready",
            SPU_SOURCE,
            asOf,
            product.ratingAvg == null ? null : Number(product.ratingAvg),
          ),
          skuCount: this.value(SPU_SOURCE, asOf, product.skuCount, stampSpu),
          channelCount: this.value(SPU_SOURCE, asOf, product.channelCount, stampSpu),
        },
      },
      fields: FIELDS.map((item) => ({ key: item.key, label: item.label, field: text(item.key) })),
      tags: TAGS.map((item) => ({ key: item.key, label: item.label, field: text(item.key) })),
      packaging: {
        product: this.value(
          SKU_SOURCE,
          packagingAsOf,
          anyFilled(productPackaging) ? productPackaging : null,
          stampSku,
        ),
        carton: this.value(
          SKU_SOURCE,
          packagingAsOf,
          anyFilled(cartonPackaging) ? cartonPackaging : null,
          stampSku,
        ),
      },
      variants: skus.map((sku) => {
        const price = num(sku.suggestPrice);
        return {
          skuCode: sku.skuCode,
          skuName: sku.skuName,
          skuNameEn: sku.skuNameEn,
          skuImage: sku.skuImageUrl,
          skuStateLabel: SKU_STATE_LABEL[sku.skuState ?? -1] ?? sku.skuStateDesc ?? "未知状态",
          suggestPrice: commercial(
            user,
            price === null ? "empty" : "ready",
            SKU_SOURCE,
            stampSku.asOf,
            price,
          ),
          currency: sku.suggestCurrency,
          codes: (codesBySku.get(sku.skuCode) ?? []).map((code) => ({
            channel: code.channel,
            channelName: code.channelName,
            site: code.site,
            shopCode: code.shopCode,
            platformSku: code.saleSkuCode,
            asin: code.asin,
          })),
          unavailableCodes: UNAVAILABLE_CODES,
        };
      }),
      variantsMeta: { total: skus.length, source: SKU_SOURCE, asOf: stampSku.asOf },
    };
  }
}
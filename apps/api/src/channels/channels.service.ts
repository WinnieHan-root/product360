import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { SOURCE_TABLE_LABEL, type DataStatus } from "@product360/shared";
import { AccessService } from "../common/access.service";
import type { AuthUser } from "../common/auth-user";
import { commercial, dayKey, field, round } from "../common/field";
import { PrismaService } from "../common/prisma.service";
import { SourceService, type SourceStamp } from "../common/source.service";

const SALES_TABLE = "dws_sal_sku_statistics_td_df";
const CODE_TABLE = "dim_sal_sku_info_df";
const STOCK_TABLE = "dwb_scm_stock_channel_df";
const SALES_SOURCE = SOURCE_TABLE_LABEL[SALES_TABLE];
const CODE_SOURCE = SOURCE_TABLE_LABEL[CODE_TABLE];
const STOCK_SOURCE = SOURCE_TABLE_LABEL[STOCK_TABLE];

const MIN_DAYS = 7;
const MAX_DAYS = 90;
const DEFAULT_DAYS = 30;

interface SalesRow {
  channel: string;
  site: string | null;
  shop: string | null;
  platformSku: string;
  skuCode: string | null;
  asin: string | null;
  saleQty: number;
  salesAmountUsd: Prisma.Decimal | null;
}

interface CodeRow {
  channel: string;
  channelName: string | null;
  site: string | null;
  shopCode: string | null;
  platformSku: string;
  asin: string | null;
  skuCode: string | null;
  listingStatus: string | null;
  suggestPrice: Prisma.Decimal | null;
  currency: string | null;
}

interface StockRow {
  skuCode: string;
  inStockQty: number;
  onWayQty: number;
}

interface DayRow {
  day: Date;
  saleQty: number;
  salesAmountUsd: Prisma.Decimal | null;
}

interface RowState {
  channel: string;
  channelName: string | null;
  site: string | null;
  shopCode: string | null;
  platformSku: string;
  asin: string | null;
  skuCode: string | null;
  hasCode: boolean;
  listingStatus: string | null;
  suggestPrice: number | null;
  hasSales: boolean;
  saleQty: number | null;
  salesAmountUsd: number | null;
}

function startOfUtcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function addDays(value: Date, days: number): Date {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

const keyOf = (parts: Array<string | null>) =>
  parts.map((part) => part ?? "").join("\u0001");

@Injectable()
export class ChannelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly sources: SourceService,
  ) {}

  /** 窗口无行且有源表数据时为 empty，整表无该 SPU 数据时为 not_connected */
  private metric<T>(
    stamp: SourceStamp,
    status: DataStatus,
    source: string,
    value: T | null,
    at: Date | string | null,
  ) {
    return field(this.sources.resolve(status, stamp), source, at, value);
  }

  async get(spu: string, user: AuthUser, days = DEFAULT_DAYS) {
    const spuCode = await this.access.requireProduct(spu, user);
    const span = days >= MIN_DAYS && days <= MAX_DAYS ? Math.trunc(days) : DEFAULT_DAYS;

    const [product, stampSales, stampCode, stampStock] = await Promise.all([
      this.prisma.pdSpu.findUniqueOrThrow({
        where: { spuCode },
        select: { skuCount: true, hasSales: true },
      }),
      this.sources.stamp(SALES_TABLE),
      this.sources.stamp(CODE_TABLE),
      this.sources.stamp(STOCK_TABLE),
    ]);

    const bounds = await this.prisma.$queryRaw<{ to: Date | null }[]>`
      SELECT max(order_date) AS "to" FROM sal_sku_day WHERE spu_code = ${spuCode}
    `;
    const to = startOfUtcDay(bounds[0]?.to ?? new Date());
    const from = addDays(to, -(span - 1));
    const labels = Array.from({ length: span }, (_, index) => dayKey(addDays(from, index)));

    const [salesRows, codeRows, stockRows, dayRows] = await Promise.all([
      this.prisma.$queryRaw<SalesRow[]>`
        SELECT COALESCE(channel, platform) AS channel,
               country_code AS site,
               shop,
               platform_sku AS "platformSku",
               max(sku_code) AS "skuCode",
               max(asin) AS asin,
               sum(sale_qty)::int AS "saleQty",
               sum(sales_amount_usd) AS "salesAmountUsd"
        FROM sal_sku_day
        WHERE spu_code = ${spuCode} AND order_date BETWEEN ${from} AND ${to}
        GROUP BY 1, 2, 3, 4
        ORDER BY 1, 2, 3, 4
      `,
      this.prisma.$queryRaw<CodeRow[]>`
        SELECT channel,
               channel_name AS "channelName",
               site,
               shop_code AS "shopCode",
               sale_sku_code AS "platformSku",
               asin,
               sku_code AS "skuCode",
               listing_status AS "listingStatus",
               suggest_price AS "suggestPrice",
               suggest_currency AS currency
        FROM sal_sku_code
        WHERE spu_code = ${spuCode}
        ORDER BY channel, site, shop_code, sale_sku_code
      `,
      // SKU 归属：pd_sku 与 sal_sku_code 任一侧能挂到本 SPU 即算，避免样本抽样造成的断言
      this.prisma.$queryRaw<StockRow[]>`
        SELECT st.sku_code AS "skuCode",
               sum(st.in_stock_qty)::int AS "inStockQty",
               sum(st.on_way_qty)::int AS "onWayQty"
        FROM scm_stock st
        WHERE st.sku_code IN (
          SELECT sku_code FROM pd_sku WHERE spu_code = ${spuCode}
          UNION
          SELECT sku_code FROM sal_sku_code WHERE spu_code = ${spuCode} AND sku_code IS NOT NULL
        )
        GROUP BY 1
      `,
      this.prisma.$queryRaw<DayRow[]>`
        SELECT order_date AS day,
               sum(sale_qty)::int AS "saleQty",
               sum(sales_amount_usd) AS "salesAmountUsd"
        FROM sal_sku_day
        WHERE spu_code = ${spuCode} AND order_date BETWEEN ${from} AND ${to}
        GROUP BY 1
        ORDER BY 1
      `,
    ]);

    const stockBySku = new Map(stockRows.map((row) => [row.skuCode, row]));
    const merged = new Map<string, RowState>();

    for (const row of codeRows) {
      const key = keyOf([row.channel, row.site, row.shopCode, row.platformSku]);
      merged.set(key, {
        channel: row.channel,
        channelName: row.channelName,
        site: row.site,
        shopCode: row.shopCode,
        platformSku: row.platformSku,
        asin: row.asin,
        skuCode: row.skuCode,
        hasCode: true,
        listingStatus: row.listingStatus,
        suggestPrice: row.suggestPrice == null ? null : Number(row.suggestPrice),
        hasSales: false,
        saleQty: null,
        salesAmountUsd: null,
      });
    }

    for (const row of salesRows) {
      const key = keyOf([row.channel, row.site, row.shop, row.platformSku]);
      const existing = merged.get(key);
      const amount = row.salesAmountUsd == null ? null : Number(row.salesAmountUsd);
      if (existing) {
        existing.hasSales = true;
        existing.saleQty = row.saleQty;
        existing.salesAmountUsd = amount;
        existing.asin = existing.asin ?? row.asin;
        existing.skuCode = existing.skuCode ?? row.skuCode;
        continue;
      }
      merged.set(key, {
        channel: row.channel,
        channelName: null,
        site: row.site,
        shopCode: row.shop,
        platformSku: row.platformSku,
        asin: row.asin,
        skuCode: row.skuCode,
        hasCode: false,
        listingStatus: null,
        suggestPrice: null,
        hasSales: true,
        saleQty: row.saleQty,
        salesAmountUsd: amount,
      });
    }

    const rows = [...merged.values()].map((row) => {
      const stock = row.skuCode ? stockBySku.get(row.skuCode) : undefined;
      const stockStatus: DataStatus = row.skuCode
        ? stock
          ? "ready"
          : "empty"
        : "not_connected";
      return {
        channel: row.channel,
        channelName: row.channelName,
        site: row.site,
        shopCode: row.shopCode,
        platformSku: row.platformSku,
        asin: row.asin,
        skuCode: row.skuCode,
        listingStatus: this.metric(
          stampCode,
          row.hasCode ? (row.listingStatus ? "ready" : "empty") : "not_connected",
          CODE_SOURCE,
          row.listingStatus,
          stampCode.asOf,
        ),
        suggestPrice: commercial(
          user,
          row.hasCode ? (row.suggestPrice == null ? "empty" : "ready") : "not_connected",
          CODE_SOURCE,
          stampCode.asOf,
          row.suggestPrice,
        ),
        saleQty: commercial(
          user,
          row.hasSales ? "ready" : product.hasSales ? "empty" : "not_connected",
          SALES_SOURCE,
          stampSales.asOf,
          row.saleQty,
        ),
        salesAmountUsd: commercial(
          user,
          row.hasSales ? "ready" : product.hasSales ? "empty" : "not_connected",
          SALES_SOURCE,
          stampSales.asOf,
          round(row.salesAmountUsd, 2),
        ),
        inStockQty: commercial(
          user,
          stockStatus,
          STOCK_SOURCE,
          stampStock.asOf,
          stock ? stock.inStockQty : null,
        ),
        onWayQty: commercial(
          user,
          stockStatus,
          STOCK_SOURCE,
          stampStock.asOf,
          stock ? stock.onWayQty : null,
        ),
      };
    });

    const totalSaleQty = salesRows.reduce((sum, row) => sum + row.saleQty, 0);
    const totalSalesAmount = salesRows.reduce(
      (sum, row) => sum + (row.salesAmountUsd == null ? 0 : Number(row.salesAmountUsd)),
      0,
    );
    const totalInStock = stockRows.reduce((sum, row) => sum + row.inStockQty, 0);
    const totalOnWay = stockRows.reduce((sum, row) => sum + row.onWayQty, 0);
    const stockConnected = product.skuCount > 0;

    const summary = [
      {
        key: "channelCount",
        label: "覆盖渠道",
        field: this.metric(
          stampCode,
          rows.length ? "ready" : "not_connected",
          CODE_SOURCE,
          new Set(rows.map((row) => row.channel)).size,
          stampCode.asOf,
        ),
      },
      {
        key: "saleQty",
        label: `近 ${span} 天销量`,
        field: commercial(
          user,
          salesRows.length ? "ready" : product.hasSales ? "empty" : "not_connected",
          SALES_SOURCE,
          stampSales.asOf,
          salesRows.length ? totalSaleQty : null,
        ),
      },
      {
        key: "salesAmountUsd",
        label: `近 ${span} 天销售额(USD)`,
        field: commercial(
          user,
          salesRows.length ? "ready" : product.hasSales ? "empty" : "not_connected",
          SALES_SOURCE,
          stampSales.asOf,
          salesRows.length ? round(totalSalesAmount, 2) : null,
        ),
      },
      {
        key: "inStockQty",
        label: "在库",
        field: commercial(
          user,
          stockConnected ? (stockRows.length ? "ready" : "empty") : "not_connected",
          STOCK_SOURCE,
          stampStock.asOf,
          stockRows.length ? totalInStock : null,
        ),
      },
      {
        key: "onWayQty",
        label: "在途",
        field: commercial(
          user,
          stockConnected ? (stockRows.length ? "ready" : "empty") : "not_connected",
          STOCK_SOURCE,
          stampStock.asOf,
          stockRows.length ? totalOnWay : null,
        ),
      },
    ];

    const daySales = new Map(
      dayRows.map((row) => [
        dayKey(row.day),
        { saleQty: row.saleQty, salesAmountUsd: row.salesAmountUsd },
      ]),
    );

    return {
      window: { days: span, from: dayKey(from), to: dayKey(to) },
      summary,
      rows,
      trend: {
        metrics: ["saleQty", "salesAmountUsd"],
        labels,
        saleQty: labels.map((label) => daySales.get(label)?.saleQty ?? null),
        salesAmountUsd: labels.map((label) => {
          const value = daySales.get(label)?.salesAmountUsd;
          return value == null ? null : round(Number(value), 2);
        }),
        status: this.sources.resolve(dayRows.length ? "ready" : "not_connected", stampSales),
        source: SALES_SOURCE,
        asOf: stampSales.asOf,
        note: "源表无挂牌价日快照，不提供价格趋势",
      },
    };
  }
}
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { SOURCE_TABLE_LABEL, type DataStatus } from "@product360/shared";
import { AccessService } from "../common/access.service";
import type { AuthUser } from "../common/auth-user";
import { commercial, dayKey, field, num, round } from "../common/field";
import { PrismaService } from "../common/prisma.service";
import { SourceService, type SourceStamp } from "../common/source.service";

const SALES_TABLE = "dws_sal_sku_statistics_td_df";
const CODE_TABLE = "dim_sal_sku_info_df";
const STOCK_TABLE = "dwb_scm_stock_channel_df";
const LISTING_TABLE = "ads_sal_sku_online_listing_df";
const SALES_SOURCE = SOURCE_TABLE_LABEL[SALES_TABLE];
const CODE_SOURCE = SOURCE_TABLE_LABEL[CODE_TABLE];
const STOCK_SOURCE = SOURCE_TABLE_LABEL[STOCK_TABLE];
const LISTING_SOURCE = SOURCE_TABLE_LABEL[LISTING_TABLE];

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

interface ListingRow {
  channel: string;
  site: string | null;
  shopCode: string | null;
  msku: string;
  externalId: string | null;
  externalIdType: string | null;
  parentExternalId: string | null;
  skuCode: string | null;
  title: string | null;
  descriptionSummary: string | null;
  mainImageUrl: string | null;
  listingStatus: string | null;
  listingStatusRaw: string | null;
  operatorName: string | null;
  currencyCode: string | null;
  listPrice: Prisma.Decimal | null;
  salePrice: Prisma.Decimal | null;
  rating: Prisma.Decimal | null;
  contentItemCnt: number | null;
  hasTitle: number | null;
  hasMainImage: number | null;
  hasDescription: number | null;
  hasPrice: number | null;
  hasStatus: number | null;
  productLink: string | null;
  srcTable: string | null;
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

  /**
   * 在线 listing 明细（P2-4）。数据源是 ads_sal_sku_online_listing_df，
   * 与上面 get() 用的 sal_sku_code / sal_sku_day 是两套口径：
   * 这里回答「渠道上架了什么、内容是否完整」，不涉及销量与库存。
   *
   * 默认只看 online：offline 里 421/749 行缺描述、160 行缺主图，
   * 与在线商品混在一起看，完整度列会变成噪声（见 p2-enhancement-design §4.3）。
   */
  async listings(spu: string, user: AuthUser, status: string = "online") {
    const spuCode = await this.access.requireProduct(spu, user);
    const stamp = await this.sources.stamp(LISTING_TABLE);

    const filter = status === "all" ? Prisma.sql`TRUE` : Prisma.sql`l.listing_status = ${status}`;

    const rows = await this.prisma.$queryRaw<ListingRow[]>`
      SELECT l.channel,
             l.site,
             l.shop_code AS "shopCode",
             l.msku,
             l.external_id AS "externalId",
             l.external_id_type AS "externalIdType",
             l.parent_external_id AS "parentExternalId",
             l.sku_code AS "skuCode",
             l.title,
             l.description_summary AS "descriptionSummary",
             l.main_image_url AS "mainImageUrl",
             l.listing_status AS "listingStatus",
             l.listing_status_raw AS "listingStatusRaw",
             l.operator_name AS "operatorName",
             l.currency_code AS "currencyCode",
             l.list_price AS "listPrice",
             l.sale_price AS "salePrice",
             l.rating,
             l.content_item_cnt AS "contentItemCnt",
             l.has_title AS "hasTitle",
             l.has_main_image AS "hasMainImage",
             l.has_description AS "hasDescription",
             l.has_price AS "hasPrice",
             l.has_status AS "hasStatus",
             l.product_link AS "productLink",
             l.src_table AS "srcTable"
      FROM sal_sku_online_listing l
      WHERE l.spu_code = ${spuCode} AND ${filter}
      ORDER BY l.channel, l.site, l.shop_code, l.msku
    `;

    // 全量（不受 status 过滤）的状态计数，用于 Segmented 上的徽标
    const counts = await this.prisma.$queryRaw<{ status: string | null; count: number }[]>`
      SELECT listing_status AS status, count(*)::int AS count
      FROM sal_sku_online_listing
      WHERE spu_code = ${spuCode}
      GROUP BY 1
    `;
    const countOf = (key: string) => counts.find((row) => row.status === key)?.count ?? 0;
    const total = counts.reduce((sum, row) => sum + row.count, 0);

    // 按渠道聚合：渠道有多少条 listing、覆盖哪些站点、内容满分几条
    const byChannel = new Map<
      string,
      {
        channel: string;
        listingCount: number;
        sites: string[];
        shops: number;
        onlineCount: number;
        fullContentCount: number;
        contentSum: number;
        contentRows: number;
        missing: { title: number; image: number; description: number; price: number };
      }
    >();
    for (const row of rows) {
      const item =
        byChannel.get(row.channel) ??
        {
          channel: row.channel,
          listingCount: 0,
          sites: [],
          shops: 0,
          onlineCount: 0,
          fullContentCount: 0,
          contentSum: 0,
          contentRows: 0,
          missing: { title: 0, image: 0, description: 0, price: 0 },
        };
      item.listingCount += 1;
      if (row.site && !item.sites.includes(row.site)) item.sites.push(row.site);
      if (row.listingStatus === "online") item.onlineCount += 1;
      if (row.contentItemCnt != null) {
        item.contentSum += row.contentItemCnt;
        item.contentRows += 1;
        if (row.contentItemCnt >= 5) item.fullContentCount += 1;
      }
      if (!row.hasTitle) item.missing.title += 1;
      if (!row.hasMainImage) item.missing.image += 1;
      if (!row.hasDescription) item.missing.description += 1;
      if (!row.hasPrice) item.missing.price += 1;
      byChannel.set(row.channel, item);
    }
    const shopsByChannel = new Map<string, Set<string>>();
    for (const row of rows) {
      if (!row.shopCode) continue;
      const set = shopsByChannel.get(row.channel) ?? new Set<string>();
      set.add(row.shopCode);
      shopsByChannel.set(row.channel, set);
    }

    const channels = [...byChannel.values()]
      .map((item) => ({
        channel: item.channel,
        listingCount: item.listingCount,
        shops: shopsByChannel.get(item.channel)?.size ?? 0,
        sites: item.sites.sort(),
        onlineCount: item.onlineCount,
        fullContentCount: item.fullContentCount,
        /** 平均内容完整度（0~5），无数据时 null——不补 0 */
        contentAvg: item.contentRows ? round(item.contentSum / item.contentRows, 1) : null,
        missing: item.missing,
      }))
      .sort((a, b) => b.listingCount - a.listingCount || a.channel.localeCompare(b.channel));

    const items = rows.map((row) => ({
      channel: row.channel,
      site: row.site,
      shopCode: row.shopCode,
      msku: row.msku,
      externalId: row.externalId,
      externalIdType: row.externalIdType,
      parentExternalId: row.parentExternalId,
      skuCode: row.skuCode,
      // 源端为空就是空，不拿 spuName 之类去补——见五态规则
      title: field<string>(
        this.sources.resolve(row.title ? "ready" : "empty", stamp),
        LISTING_SOURCE,
        stamp.asOf,
        row.title,
      ),
      descriptionSummary: field<string>(
        this.sources.resolve(row.descriptionSummary ? "ready" : "empty", stamp),
        LISTING_SOURCE,
        stamp.asOf,
        row.descriptionSummary,
      ),
      mainImageUrl: field<string>(
        this.sources.resolve(row.mainImageUrl ? "ready" : "empty", stamp),
        LISTING_SOURCE,
        stamp.asOf,
        row.mainImageUrl,
      ),
      listingStatus: row.listingStatus,
      /** 源端原值（「下架|正常」「AVAILABLE_FOR_SALE」等），用于解释归一结果 */
      listingStatusRaw: row.listingStatusRaw,
      operatorName: row.operatorName,
      currencyCode: row.currencyCode,
      listPrice: commercial(
        user,
        row.listPrice == null ? "empty" : "ready",
        LISTING_SOURCE,
        stamp.asOf,
        num(row.listPrice),
      ),
      salePrice: commercial(
        user,
        row.salePrice == null ? "empty" : "ready",
        LISTING_SOURCE,
        stamp.asOf,
        num(row.salePrice),
      ),
      rating: row.rating == null ? null : Number(row.rating),
      /** 内容完整度 0~5（5 项标记之和，源端已算好，不重算） */
      contentItemCnt: row.contentItemCnt,
      contentFlags: {
        title: row.hasTitle === 1,
        mainImage: row.hasMainImage === 1,
        description: row.hasDescription === 1,
        price: row.hasPrice === 1,
        status: row.hasStatus === 1,
      },
      productLink: row.productLink,
      srcTable: row.srcTable,
    }));

    return {
      spuCode,
      status,
      counts: {
        total,
        online: countOf("online"),
        offline: countOf("offline"),
        draft: countOf("draft"),
        deleted: countOf("deleted"),
      },
      channels,
      items,
      /** 数据覆盖范围必须显式声明：本表只覆盖 amazon / aliexpress 系，不是真「全渠道」 */
      coverage: {
        channels: [...new Set(rows.map((row) => row.channel))].sort(),
        srcTables: [...new Set(rows.map((row) => row.srcTable).filter((v): v is string => !!v))].sort(),
        note: "覆盖 Amazon、Shopify、Shopee、Lazada、Mercado Libre、Shein、AliExpress 等渠道，仍非公司全部销售渠道",
        status: this.sources.resolve(items.length ? "ready" : "empty", stamp),
        source: LISTING_SOURCE,
        asOf: stamp.asOf,
      },
    };
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
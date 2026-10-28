import { randomUUID } from "crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import {
  chunk,
  dayDate,
  decimal,
  integer,
  json,
  mode,
  readTable,
  readerFactory,
  text,
  timestamp,
} from "./source";
import type { CsvTable } from "./csv";

const prisma = new PrismaClient();

export interface LoadResult {
  source: string;
  target: string;
  read: number;
  written: number;
}

const FILES = {
  spu: "dim_pd_spu_info_df",
  sku: "dim_pd_sku_info_df",
  salCode: "dim_sal_sku_info_df",
  salDay: "dws_sal_sku_statistics_td_df",
  stock: "dwb_scm_stock_channel_df",
  voc: "dws_cs_voc_nps_review_df",
  ticket: "dwb_cs_voc_record_channel_hf",
} as const;

const BASE_TABLES = [
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
];

function nullableJson(value: unknown | null): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === null ? Prisma.DbNull : (value as Prisma.InputJsonValue);
}

function fileDs(table: CsvTable): Date | null {
  const read = readerFactory(table);
  return dayDate(mode(table.rows.map((row) => text(read(row)("ds")))));
}

async function createMany<T>(items: T[], run: (batch: T[]) => Promise<unknown>): Promise<number> {
  let written = 0;
  for (const batch of chunk(items, 400)) {
    await run(batch);
    written += batch.length;
  }
  return written;
}

async function truncateAll(): Promise<void> {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${BASE_TABLES.map((name) => `"${name}"`).join(", ")} RESTART IDENTITY CASCADE`,
  );
}

/* ------------------------------------------------------------------ pd_sku */

async function loadSku(): Promise<LoadResult> {
  const table = readTable(FILES.sku);
  const read = readerFactory(table);
  const ds = fileDs(table);
  if (!ds) throw new Error(`${FILES.sku}: 无法确定 ds`);

  const seen = new Map<string, Prisma.PdSkuCreateManyInput>();
  for (const row of table.rows) {
    const get = read(row);
    const skuCode = text(get("sku_code"));
    if (!skuCode) continue;
    seen.set(skuCode, {
      ds,
      skuCode,
      skuCodeNew: text(get("sku_code_new")),
      scmSkuCode: text(get("scm_sku_code")),
      skuName: text(get("sku_name")) ?? skuCode,
      skuNameEn: text(get("sku_name_en")),
      skuImageUrl: text(get("sku_image_url")),
      skuState: integer(get("sku_state")),
      skuStateDesc: text(get("sku_state_desc")),
      brandCode: text(get("brand_code")),
      brandName: text(get("brand_name")),
      suggestCurrency: text(get("suggest_currency")),
      suggestPrice: decimal(get("suggest_price")),
      spuCode: text(get("spu_code")),
      spuName: text(get("spu_name")),
      spuModelName: text(get("spu_model_name")),
      specProductLength: decimal(get("spec_product_length")),
      specProductWidth: decimal(get("spec_product_width")),
      specProductHeight: decimal(get("spec_product_height")),
      specProductWeight: decimal(get("spec_product_weight")),
      specProductNetWeight: decimal(get("spec_product_net_weight")),
      specCartonLength: decimal(get("spec_carton_length")),
      specCartonWidth: decimal(get("spec_carton_width")),
      specCartonHeight: decimal(get("spec_carton_height")),
      specCartonWeight: decimal(get("spec_carton_weight")),
      specCartonNum: integer(get("spec_carton_num")),
      specMaterial: text(get("spec_material")),
      skuColor: text(get("sku_color")),
      skuSize: text(get("sku_size")),
      skuPack: text(get("sku_pack")),
      listingTime: timestamp(get("listing_time")),
      attrInfo: nullableJson(json(get("attr_info"))),
      sensitiveInfo: nullableJson(json(get("sensitive_info"))),
      deleted: integer(get("deleted")) ?? 0,
      updateTime: timestamp(get("update_time")),
    });
  }

  const data = [...seen.values()];
  const written = await createMany(data, (batch) => prisma.pdSku.createMany({ data: batch }));
  return { source: FILES.sku, target: "pd_sku", read: table.rows.length, written };
}

/* ------------------------------------------------------------------ pd_spu */

function modelNameOf(value: unknown | null): string | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const first = value[0] as Record<string, unknown> | undefined;
  const name = first?.model_name ?? first?.modelName;
  return typeof name === "string" && name.trim() ? name.trim() : null;
}

async function loadSpu(): Promise<LoadResult> {
  const table = readTable(FILES.spu);
  const read = readerFactory(table);
  const ds = fileDs(table);
  if (!ds) throw new Error(`${FILES.spu}: 无法确定 ds`);

  const seen = new Map<string, Prisma.PdSpuCreateManyInput>();
  for (const row of table.rows) {
    const get = read(row);
    const spuCode = text(get("spu_code"));
    if (!spuCode) continue;
    const modelInfo = json(get("model_info"));
    seen.set(spuCode, {
      ds,
      companyCode: text(get("company_code")),
      spuCode,
      spuName: text(get("spu_name")) ?? spuCode,
      spuNameEn: text(get("spu_name_en")),
      spuAliasName: text(get("spu_alias_name")),
      spuImage: text(get("spu_image")),
      spuLevelNew: text(get("spu_level_new")),
      // 源表 spu_state 为空时归入「待上架」
      spuState: integer(get("spu_state")) ?? 1,
      spuStateDesc: text(get("spu_state_desc")) ?? "待上架",
      spuModelName: modelNameOf(modelInfo),
      spuProductTypeDesc: text(get("spu_product_type_desc")),
      spuDesc: text(get("spu_desc")),
      sellingPoint: text(get("selling_point")),
      productLineCode: text(get("product_line_code")),
      productLineName: text(get("product_line_name")),
      gtmCode: text(get("gtm_code")),
      gtmName: text(get("gtm_name")),
      productLeaderCode: text(get("product_leader_code")),
      productLeaderName: text(get("product_leader_name")),
      plannerName: text(get("planner_name")),
      brandCode: text(get("brand_code")),
      suggestCurrency: text(get("suggest_currency")),
      suggestPrice: decimal(get("suggest_price")),
      listingTime: timestamp(get("listing_time")),
      isNewSpu: integer(get("is_new_spu")),
      vocModel: text(get("voc_model")),
      categoryCode: text(get("category_code")),
      categoryName: text(get("category_name")),
      categoryCodeL1: text(get("category_code_level1")),
      categoryNameL1: text(get("category_name_level1")),
      categoryCodeL2: text(get("category_code_level2")),
      categoryNameL2: text(get("category_name_level2")),
      categoryCodeL3: text(get("category_code_level3")),
      categoryNameL3: text(get("category_name_level3")),
      categoryCodeL4: text(get("category_code_level4")),
      categoryNameL4: text(get("category_name_level4")),
      categoryCodeL5: text(get("category_code_level5")),
      categoryNameL5: text(get("category_name_level5")),
      categoryTagName: text(get("category_tag_name")),
      isElectricalDesc: text(get("is_electrical_desc")),
      classTagName: text(get("class_tag_name")),
      senceTagName: text(get("sence_tag_name")),
      fmcgTagName: text(get("fmcg_tag_name")),
      iotTagName: text(get("iot_tag_name")),
      tagInfo: nullableJson(json(get("tag_info"))),
      seriesInfo: nullableJson(json(get("series_info"))),
      modelInfo: nullableJson(modelInfo),
      deleted: integer(get("deleted")) ?? 0,
      updateTime: timestamp(get("update_time")),
    });
  }

  const data = [...seen.values()];
  const written = await createMany(data, (batch) => prisma.pdSpu.createMany({ data: batch }));
  return { source: FILES.spu, target: "pd_spu", read: table.rows.length, written };
}

/* ------------------------------------------------------------- sal_sku_code */

async function loadSalSkuCode(): Promise<LoadResult> {
  const table = readTable(FILES.salCode);
  const read = readerFactory(table);
  const ds = fileDs(table);
  if (!ds) throw new Error(`${FILES.salCode}: 无法确定 ds`);

  const seen = new Map<string, Prisma.SalSkuCodeCreateManyInput>();
  for (const row of table.rows) {
    const get = read(row);
    const saleSkuCode = text(get("sale_sku_code"));
    const channel = text(get("channel"));
    if (!saleSkuCode || !channel) continue;
    const site = text(get("site"));
    const shopCode = text(get("shop_code"));
    const skuCode = text(get("sku_code"));
    const key = [channel, site, shopCode, saleSkuCode, skuCode].map((v) => v ?? "").join("|");
    seen.set(key, {
      ds,
      channel,
      channelName: text(get("channel_name")),
      site,
      shopCode,
      shopName: text(get("shop_name")),
      saleSkuCode,
      asin: text(get("asin")),
      parentAsin: text(get("parent_asin")),
      asinUrl: text(get("asin_url")),
      skuCode,
      scmSkuCode: text(get("scm_sku_code")),
      spuCode: text(get("spu_code")),
      listingStatus: text(get("listing_status")),
      salListingTime: timestamp(get("sal_listing_time")),
      firstOrderTime: timestamp(get("first_order_time")),
      suggestCurrency: text(get("sku_suggest_currency")),
      suggestPrice: decimal(get("sku_suggest_price")),
      saleSkuQty: integer(get("sal_sku_qty")),
      salImageUrl: text(get("sal_image_url")),
      categoryNameL1: text(get("category_name_level1")),
      listingOperator: text(get("sal_operator_name")),
    });
  }

  const data = [...seen.values()];
  const written = await createMany(data, (batch) =>
    prisma.salSkuCode.createMany({ data: batch }),
  );
  return { source: FILES.salCode, target: "sal_sku_code", read: table.rows.length, written };
}

/* -------------------------------------------------------------- sal_sku_day */

async function loadSalSkuDay(): Promise<LoadResult> {
  const table = readTable(FILES.salDay);
  const read = readerFactory(table);
  const ds = fileDs(table);
  if (!ds) throw new Error(`${FILES.salDay}: 无法确定 ds`);

  interface Bucket {
    row: Prisma.SalSkuDayCreateManyInput;
    saleQty: number;
    orderQty: number;
    salesAmount: number | null;
    salesAmountUsd: number | null;
    replacementQty: number;
  }
  const buckets = new Map<string, Bucket>();

  for (const row of table.rows) {
    const get = read(row);
    const orderDate = dayDate(get("order_date"));
    const platform = text(get("platform"));
    const platformSku = text(get("platform_sku"));
    if (!orderDate || !platform || !platformSku) continue;
    const shop = text(get("shop"));
    const countryCode = text(get("country_code"));
    const key = [orderDate.toISOString(), platform, shop, countryCode, platformSku]
      .map((v) => v ?? "")
      .join("|");

    const existing = buckets.get(key);
    const bucket: Bucket = existing ?? {
      row: {
        ds,
        orderDate,
        platform,
        channel: text(get("channel")),
        shop,
        countryCode,
        countryName: text(get("country_name")),
        platformSku,
        asin: text(get("asin")),
        parentAsin: text(get("parent_asin")),
        skuCode: text(get("sku_code")),
        spuCode: text(get("spu_code")),
        spuName: text(get("spu_name")),
        skuName: text(get("sku_name")),
        brandCode: text(get("sku_brand")),
        categoryNameL1: text(get("category_name_level1")),
        orderQty: 0,
        saleQty: 0,
        salesAmount: null,
        salesAmountUsd: null,
        returnQty: 0,
      },
      saleQty: 0,
      orderQty: 0,
      salesAmount: null,
      salesAmountUsd: null,
      replacementQty: 0,
    };
    bucket.saleQty += integer(get("sale_qty")) ?? 0;
    bucket.orderQty += integer(get("order_qty")) ?? 0;
    bucket.replacementQty += integer(get("after_sale_replacement_qty")) ?? 0;
    const amount = decimal(get("sales_amount"));
    if (amount !== null) bucket.salesAmount = (bucket.salesAmount ?? 0) + Number(amount);
    const amountUsd = decimal(get("sales_amount_usd"));
    if (amountUsd !== null) bucket.salesAmountUsd = (bucket.salesAmountUsd ?? 0) + Number(amountUsd);
    buckets.set(key, bucket);
  }

  const data = [...buckets.values()].map((bucket) => ({
    ...bucket.row,
    saleQty: bucket.saleQty,
    orderQty: bucket.orderQty,
    returnQty: bucket.replacementQty,
    salesAmount: bucket.salesAmount === null ? null : String(bucket.salesAmount),
    salesAmountUsd: bucket.salesAmountUsd === null ? null : String(bucket.salesAmountUsd),
  }));

  const written = await createMany(data, (batch) =>
    prisma.salSkuDay.createMany({ data: batch }),
  );
  return { source: FILES.salDay, target: "sal_sku_day", read: table.rows.length, written };
}

/* ---------------------------------------------------------------- scm_stock */

async function loadStock(): Promise<LoadResult> {
  const table = readTable(FILES.stock);
  const read = readerFactory(table);
  const ds = fileDs(table);
  if (!ds) throw new Error(`${FILES.stock}: 无法确定 ds`);

  interface Bucket {
    row: Prisma.ScmStockCreateManyInput;
    inStock: number;
    onWay: number;
  }
  const buckets = new Map<string, Bucket>();

  for (const row of table.rows) {
    const get = read(row);
    const channelCode = text(get("channel_code"));
    const skuCode = text(get("sku_code"));
    if (!channelCode || !skuCode) continue;
    const countryCode = text(get("country_code"));
    const warehouseCode = text(get("warehouse_code"));
    const key = [channelCode, countryCode, skuCode, warehouseCode].map((v) => v ?? "").join("|");
    const bucket: Bucket = buckets.get(key) ?? {
      row: {
        ds,
        channelCode,
        countryCode,
        skuCode,
        warehouseCode,
        warehouseName: text(get("warehouse_name")),
        inStockQty: 0,
        onWayQty: 0,
      },
      inStock: 0,
      onWay: 0,
    };
    bucket.inStock += integer(get("in_stock_qty")) ?? 0;
    bucket.onWay += integer(get("on_way_qty")) ?? 0;
    buckets.set(key, bucket);
  }

  const data = [...buckets.values()].map((bucket) => ({
    ...bucket.row,
    inStockQty: bucket.inStock,
    onWayQty: bucket.onWay,
  }));
  const written = await createMany(data, (batch) => prisma.scmStock.createMany({ data: batch }));
  return { source: FILES.stock, target: "scm_stock", read: table.rows.length, written };
}

/* ------------------------------------------------- 评论 / NPS / 体验因子 / 竞品 */

interface VocBuckets {
  review: Map<string, { spuCode: string; reviewDate: Date; sum: number; count: number }>;
  sentiment: Map<string, { spuCode: string; sentiment: string; bucket: number; count: number }>;
  tag: Map<string, { spuCode: string; tagName: string; sentiment: string | null; count: number }>;
  competitor: Map<string, { brandName: string; vocModel: string; sum: number; count: number }>;
}

async function loadVoc(): Promise<LoadResult[]> {
  const table = readTable(FILES.voc);
  const read = readerFactory(table);
  const ds = fileDs(table);
  if (!ds) throw new Error(`${FILES.voc}: 无法确定 ds`);

  const buckets: VocBuckets = {
    review: new Map(),
    sentiment: new Map(),
    tag: new Map(),
    competitor: new Map(),
  };

  for (const row of table.rows) {
    const get = read(row);
    const spuCode = text(get("spu_code"));
    const own = text(get("is_own_brand")) === "1";

    if (!own) {
      const brandName = text(get("brand_name"));
      if (!brandName) continue;
      const vocModel = text(get("voc_model")) ?? "未匹配";
      const key = `${brandName}|${vocModel}`;
      const bucket = buckets.competitor.get(key) ?? { brandName, vocModel, sum: 0, count: 0 };
      const rating = integer(get("rating"));
      if (rating !== null) {
        bucket.sum += rating;
        bucket.count += 1;
      }
      buckets.competitor.set(key, bucket);
      continue;
    }

    if (!spuCode) continue;
    const reviewDate = dayDate(get("review_date"));
    const rating = integer(get("rating"));
    if (reviewDate && rating !== null) {
      const key = `${spuCode}|${reviewDate.toISOString()}`;
      const bucket = buckets.review.get(key) ?? { spuCode, reviewDate, sum: 0, count: 0 };
      bucket.sum += rating;
      bucket.count += 1;
      buckets.review.set(key, bucket);
    }

    const sentiment = text(get("nps_overall_sentiment"));
    if (sentiment) {
      const bucketValue = integer(get("sentiment_bucket")) ?? 0;
      const key = `${spuCode}|${sentiment}`;
      const bucket = buckets.sentiment.get(key) ?? {
        spuCode,
        sentiment,
        bucket: bucketValue,
        count: 0,
      };
      bucket.count += 1;
      buckets.sentiment.set(key, bucket);
    }

    const tags = json(get("nps_tag_list"));
    if (Array.isArray(tags)) {
      for (const item of tags) {
        const record = item as Record<string, unknown>;
        const tagName = typeof record.tag_name === "string" ? record.tag_name.trim() : "";
        if (!tagName) continue;
        const tagSentiment =
          typeof record.tag_sentiment === "string" ? record.tag_sentiment.trim() : null;
        const key = `${spuCode}|${tagName}|${tagSentiment ?? ""}`;
        const bucket = buckets.tag.get(key) ?? {
          spuCode,
          tagName,
          sentiment: tagSentiment,
          count: 0,
        };
        bucket.count += 1;
        buckets.tag.set(key, bucket);
      }
    }
  }

  const reviewTotals = new Map<string, number>();
  for (const bucket of buckets.review.values()) {
    reviewTotals.set(bucket.spuCode, (reviewTotals.get(bucket.spuCode) ?? 0) + bucket.count);
  }
  const sentimentTotals = new Map<string, number>();
  for (const bucket of buckets.sentiment.values()) {
    sentimentTotals.set(bucket.spuCode, (sentimentTotals.get(bucket.spuCode) ?? 0) + bucket.count);
  }
  const tagTotals = new Map<string, number>();
  for (const bucket of buckets.tag.values()) {
    tagTotals.set(bucket.spuCode, (tagTotals.get(bucket.spuCode) ?? 0) + bucket.count);
  }

  const reviewData: Prisma.VocReviewDayCreateManyInput[] = [...buckets.review.values()].map(
    (bucket) => ({
      ds,
      spuCode: bucket.spuCode,
      reviewDate: bucket.reviewDate,
      ratingAvg: String(Math.round((bucket.sum / bucket.count) * 1000) / 1000),
      reviewCount: bucket.count,
    }),
  );
  const sentimentData: Prisma.VocNpsSentimentCreateManyInput[] = [
    ...buckets.sentiment.values(),
  ].map((bucket) => ({
    ds,
    spuCode: bucket.spuCode,
    sentiment: bucket.sentiment,
    bucket: bucket.bucket,
    itemCount: bucket.count,
    ratio: String(
      Math.round((bucket.count / (sentimentTotals.get(bucket.spuCode) ?? bucket.count)) * 10000) /
        10000,
    ),
  }));
  const tagData: Prisma.VocNpsTagCreateManyInput[] = [...buckets.tag.values()].map((bucket) => ({
    ds,
    spuCode: bucket.spuCode,
    tagName: bucket.tagName,
    sentiment: bucket.sentiment,
    tagCount: bucket.count,
    ratio: String(
      Math.round((bucket.count / (tagTotals.get(bucket.spuCode) ?? bucket.count)) * 10000) / 10000,
    ),
  }));
  const competitorData: Prisma.VocCompetitorCreateManyInput[] = [
    ...buckets.competitor.values(),
  ]
    .filter((bucket) => bucket.count > 0)
    .map((bucket) => ({
      ds,
      brandName: bucket.brandName,
      vocModel: bucket.vocModel,
      ratingAvg: String(Math.round((bucket.sum / bucket.count) * 1000) / 1000),
      reviewCount: bucket.count,
    }));

  const reviewWritten = await createMany(reviewData, (batch) =>
    prisma.vocReviewDay.createMany({ data: batch }),
  );
  const sentimentWritten = await createMany(sentimentData, (batch) =>
    prisma.vocNpsSentiment.createMany({ data: batch }),
  );
  const tagWritten = await createMany(tagData, (batch) =>
    prisma.vocNpsTag.createMany({ data: batch }),
  );
  const competitorWritten = await createMany(competitorData, (batch) =>
    prisma.vocCompetitor.createMany({ data: batch }),
  );

  const readCount = table.rows.length;
  return [
    { source: FILES.voc, target: "voc_review_day", read: readCount, written: reviewWritten },
    { source: FILES.voc, target: "voc_nps_sentiment", read: readCount, written: sentimentWritten },
    { source: FILES.voc, target: "voc_nps_tag", read: readCount, written: tagWritten },
    { source: FILES.voc, target: "voc_competitor", read: readCount, written: competitorWritten },
  ];
}

/* ------------------------------------------------------------- 工单主题 */

async function loadTicketTopic(): Promise<LoadResult> {
  const table = readTable(FILES.ticket);
  const read = readerFactory(table);
  const ds = fileDs(table);
  if (!ds) throw new Error(`${FILES.ticket}: 无法确定 ds`);

  interface Bucket {
    topic: string;
    count: number;
    vocType: Map<string, number>;
  }
  const buckets = new Map<string, Bucket>();
  const spuTotals = new Map<string, number>();

  for (const row of table.rows) {
    const get = read(row);
    const spuCode = text(get("spu_code"));
    if (!spuCode) continue;
    const topic =
      text(get("classification_cn")) ??
      text(get("effective_classification_tag")) ??
      "未分类";
    const key = `${spuCode}|${topic}`;
    const bucket = buckets.get(key) ?? { topic, count: 0, vocType: new Map() };
    bucket.count += 1;
    const vocType = text(get("voc_type"));
    if (vocType) bucket.vocType.set(vocType, (bucket.vocType.get(vocType) ?? 0) + 1);
    buckets.set(key, bucket);
    spuTotals.set(spuCode, (spuTotals.get(spuCode) ?? 0) + 1);
  }

  const data: Prisma.VocTicketTopicCreateManyInput[] = [...buckets.entries()].map(
    ([key, bucket]) => {
      const spuCode = key.split("|")[0];
      const total = spuTotals.get(spuCode) ?? bucket.count;
      const vocType = [...bucket.vocType.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      return {
        ds,
        spuCode,
        topic: bucket.topic,
        vocType,
        ticketCount: bucket.count,
        ratio: String(Math.round((bucket.count / total) * 10000) / 10000),
      };
    },
  );

  const written = await createMany(data, (batch) =>
    prisma.vocTicketTopic.createMany({ data: batch }),
  );
  return { source: FILES.ticket, target: "voc_ticket_topic", read: table.rows.length, written };
}

/* ------------------------------------------------------------ 预聚合与覆盖率 */

async function buildAggregates(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    UPDATE pd_spu s SET spu_model_name = x.spu_model_name
    FROM (
      SELECT DISTINCT ON (spu_code) spu_code, spu_model_name
      FROM pd_sku WHERE spu_code IS NOT NULL AND spu_model_name IS NOT NULL
      ORDER BY spu_code, sku_code
    ) x
    WHERE s.spu_code = x.spu_code AND (s.spu_model_name IS NULL OR s.spu_model_name = '')
  `);

  await prisma.$executeRawUnsafe(`
    UPDATE pd_spu s SET sku_count = x.cnt
    FROM (SELECT spu_code, count(*)::int AS cnt FROM pd_sku WHERE spu_code IS NOT NULL GROUP BY spu_code) x
    WHERE s.spu_code = x.spu_code
  `);

  await prisma.$executeRawUnsafe(`
    UPDATE pd_spu s SET channel_count = x.cnt
    FROM (
      SELECT spu_code, count(DISTINCT channel)::int AS cnt
      FROM sal_sku_code WHERE spu_code IS NOT NULL GROUP BY spu_code
    ) x
    WHERE s.spu_code = x.spu_code
  `);

  await prisma.$executeRawUnsafe(`
    UPDATE pd_spu s SET market_countries = x.countries
    FROM (
      SELECT spu_code, array_agg(DISTINCT country_code ORDER BY country_code) AS countries
      FROM sal_sku_day WHERE spu_code IS NOT NULL AND country_code IS NOT NULL GROUP BY spu_code
    ) x
    WHERE s.spu_code = x.spu_code
  `);

  await prisma.$executeRawUnsafe(`
    UPDATE pd_spu s SET sales_30d_qty = COALESCE(x.qty, 0), sales_30d_usd = x.usd
    FROM (
      SELECT spu_code, sum(sale_qty)::int AS qty, sum(sales_amount_usd) AS usd
      FROM sal_sku_day
      WHERE spu_code IS NOT NULL
        AND order_date >= (SELECT max(order_date) FROM sal_sku_day) - INTERVAL '29 day'
      GROUP BY spu_code
    ) x
    WHERE s.spu_code = x.spu_code
  `);

  await prisma.$executeRawUnsafe(`
    UPDATE pd_spu s SET in_stock_qty = COALESCE(x.instock, 0), on_way_qty = COALESCE(x.onway, 0)
    FROM (
      SELECT k.spu_code, sum(t.in_stock_qty)::int AS instock, sum(t.on_way_qty)::int AS onway
      FROM scm_stock t JOIN pd_sku k ON k.sku_code = t.sku_code
      WHERE k.spu_code IS NOT NULL
      GROUP BY k.spu_code
    ) x
    WHERE s.spu_code = x.spu_code
  `);

  await prisma.$executeRawUnsafe(`
    UPDATE pd_spu s SET review_count = COALESCE(x.cnt, 0), rating_avg = x.avg
    FROM (
      SELECT spu_code,
             sum(review_count)::int AS cnt,
             (sum(rating_avg * review_count) / NULLIF(sum(review_count), 0))::numeric(4,3) AS avg
      FROM voc_review_day GROUP BY spu_code
    ) x
    WHERE s.spu_code = x.spu_code
  `);

  await prisma.$executeRawUnsafe(`
    UPDATE pd_spu s SET has_sales = TRUE
    WHERE EXISTS (SELECT 1 FROM sal_sku_day d WHERE d.spu_code = s.spu_code)
  `);

  await prisma.$executeRawUnsafe(`
    UPDATE pd_spu SET coverage =
      (CASE WHEN sku_count > 0 THEN 1 ELSE 0 END) +
      (CASE WHEN channel_count > 0 THEN 1 ELSE 0 END) +
      (CASE WHEN has_sales THEN 1 ELSE 0 END) +
      (CASE WHEN review_count > 0 THEN 1 ELSE 0 END)
  `);
}

/* ------------------------------------------------------------------ 主流程 */

async function recordBatch(
  batchId: string,
  sourceTable: string,
  sourceDs: Date | null,
  rowCount: number,
  status: string,
  message: string | null,
  startedAt: Date,
): Promise<void> {
  await prisma.syncBatch.create({
    data: {
      batchId,
      sourceTable,
      sourceDs,
      rowCount,
      status,
      message,
      startedAt,
      finishedAt: new Date(),
    },
  });
}

export async function runSync(): Promise<LoadResult[]> {
  const batchId = randomUUID();
  const results: LoadResult[] = [];

  await truncateAll();

  const steps: Array<{ sourceTable: string; run: () => Promise<LoadResult | LoadResult[]> }> = [
    { sourceTable: FILES.sku, run: loadSku },
    { sourceTable: FILES.spu, run: loadSpu },
    { sourceTable: FILES.salCode, run: loadSalSkuCode },
    { sourceTable: FILES.salDay, run: loadSalSkuDay },
    { sourceTable: FILES.stock, run: loadStock },
    { sourceTable: FILES.voc, run: loadVoc },
    { sourceTable: FILES.ticket, run: loadTicketTopic },
  ];

  for (const step of steps) {
    const startedAt = new Date();
    try {
      const output = await step.run();
      const list = Array.isArray(output) ? output : [output];
      results.push(...list);
      for (const item of list) {
        await recordBatch(
          batchId,
          step.sourceTable,
          null,
          item.written,
          "success",
          `${item.source} → ${item.target}（读入 ${item.read} 行）`,
          startedAt,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await recordBatch(batchId, step.sourceTable, null, 0, "failed", message, startedAt);
      throw error;
    }
  }

  await buildAggregates();

  // 回填 source_ds（源文件级 ds 众数），供 SourceService 输出 asOf
  await prisma.$executeRawUnsafe(`
    UPDATE sync_batch b SET source_ds = x.ds
    FROM (
      SELECT '${FILES.sku}'::text AS t, max(ds) AS ds FROM pd_sku
      UNION ALL SELECT '${FILES.spu}', max(ds) FROM pd_spu
      UNION ALL SELECT '${FILES.salCode}', max(ds) FROM sal_sku_code
      UNION ALL SELECT '${FILES.salDay}', max(ds) FROM sal_sku_day
      UNION ALL SELECT '${FILES.stock}', max(ds) FROM scm_stock
      UNION ALL SELECT '${FILES.voc}', max(ds) FROM voc_review_day
      UNION ALL SELECT '${FILES.ticket}', max(ds) FROM voc_ticket_topic
    ) x
    WHERE b.source_table = x.t AND b.source_ds IS NULL
  `);

  return results;
}

export async function disconnect(): Promise<void> {
  await prisma.$disconnect();
}

export { prisma };

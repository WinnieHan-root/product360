import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  COVERAGE_DIMENSIONS,
  PAGE_SIZES,
  SOURCE_TABLE_LABEL,
  SPU_STATES,
  SPU_STATE_LABEL,
} from "@product360/shared";
import { AccessService } from "../common/access.service";
import type { AuthUser } from "../common/auth-user";
import { categoryPath, commercial, num } from "../common/field";
import { PrismaService } from "../common/prisma.service";
import { SourceService } from "../common/source.service";
import type { ProductListQuery } from "./catalog.dto";

interface MetaRow {
  code: string;
  name: string;
  spuCount: number;
}

interface SummaryRow {
  total: number;
  withDetail: number;
  fullCoverage: number;
  withSales: number;
  withReview: number;
}

interface StateBucketRow {
  code: number;
  count: number;
}

interface CoverageBucketRow {
  level: number;
  count: number;
}

interface ListRow {
  spuCode: string;
  spuName: string;
  spuNameEn: string | null;
  spuImage: string | null;
  brandCode: string | null;
  categoryNameL1: string | null;
  categoryNameL2: string | null;
  categoryNameL3: string | null;
  categoryNameL4: string | null;
  categoryNameL5: string | null;
  spuLevelNew: string | null;
  spuState: number;
  spuStateDesc: string | null;
  skuCount: number;
  channelCount: number;
  hasSales: boolean;
  marketCountries: string[];
  sales30dUsd: Prisma.Decimal | null;
  reviewCount: number;
  coverage: number;
  updateTime: Date | null;
}

/** 排序白名单：sort 参数永不参与 SQL 拼接。 */
const SORT_SQL: Record<string, Prisma.Sql> = {
  coverage: Prisma.sql`s.coverage DESC, s.spu_code ASC`,
  updateTime: Prisma.sql`s.update_time DESC NULLS LAST, s.spu_code ASC`,
  sales30d: Prisma.sql`s.sales_30d_usd DESC NULLS LAST, s.spu_code ASC`,
  reviewCount: Prisma.sql`s.review_count DESC, s.spu_code ASC`,
};

/** 类目身份：优先一级类目编码，编码缺失时退化为一级类目名称（样例中存在只有名称的行）。 */
const CATEGORY_KEY = Prisma.sql`COALESCE(NULLIF(s.category_code_level1, ''), NULLIF(s.category_name_level1, ''))`;

const LIST_COLUMNS = Prisma.sql`
  s.spu_code AS "spuCode",
  s.spu_name AS "spuName",
  s.spu_name_en AS "spuNameEn",
  s.spu_image AS "spuImage",
  s.brand_code AS "brandCode",
  s.category_name_level1 AS "categoryNameL1",
  s.category_name_level2 AS "categoryNameL2",
  s.category_name_level3 AS "categoryNameL3",
  s.category_name_level4 AS "categoryNameL4",
  s.category_name_level5 AS "categoryNameL5",
  s.spu_level_new AS "spuLevelNew",
  s.spu_state AS "spuState",
  s.spu_state_desc AS "spuStateDesc",
  s.sku_count AS "skuCount",
  s.channel_count AS "channelCount",
  s.has_sales AS "hasSales",
  s.market_countries AS "marketCountries",
  s.sales_30d_usd AS "sales30dUsd",
  s.review_count AS "reviewCount",
  s.coverage AS "coverage",
  s.update_time AS "updateTime"
`;

const SALES_TABLE = "dws_sal_sku_statistics_td_df";

function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly sources: SourceService,
  ) {}

  /** 品牌：只返回当前用户可见的品牌，不带 scope 时即全量 */
  async brands(user: AuthUser) {
    const scope = await this.access.scopeSql(user);
    const items = await this.prisma.$queryRaw<MetaRow[]>`
      SELECT s.brand_code AS code, s.brand_code AS name, count(*)::int AS "spuCount"
      FROM pd_spu s
      WHERE ${scope} AND NULLIF(s.brand_code, '') IS NOT NULL
      GROUP BY s.brand_code
      ORDER BY "spuCount" DESC, code ASC
    `;
    return { items };
  }

  /** 一级类目：同上，spuCount 即该范围内该类目下的 SPU 数 */
  async categories(user: AuthUser) {
    const scope = await this.access.scopeSql(user);
    const items = await this.prisma.$queryRaw<MetaRow[]>`
      SELECT ${CATEGORY_KEY} AS code,
             COALESCE(NULLIF(s.category_name_level1, ''), s.category_code_level1) AS name,
             count(*)::int AS "spuCount"
      FROM pd_spu s
      WHERE ${scope} AND ${CATEGORY_KEY} IS NOT NULL
      GROUP BY 1, 2
      ORDER BY "spuCount" DESC, code ASC
    `;
    return { items };
  }

  async list(user: AuthUser, query: ProductListQuery) {
    const [scopeFilter, salesStamp] = await Promise.all([
      this.access.scopeSql(user),
      this.sources.stamp(SALES_TABLE),
    ]);
    const filters: Prisma.Sql[] = [scopeFilter];

    if (query.brand) filters.push(Prisma.sql`s.brand_code = ${query.brand}`);
    if (query.category) filters.push(Prisma.sql`${CATEGORY_KEY} = ${query.category}`);
    if (query.state !== undefined) filters.push(Prisma.sql`s.spu_state = ${query.state}`);

    const q = query.q?.trim();
    if (q) {
      const exact = await this.exactSpuCodes(q);
      if (exact.length) {
        filters.push(Prisma.sql`s.spu_code IN (${Prisma.join(exact)})`);
      } else {
        const like = likePattern(q);
        filters.push(
          Prisma.sql`(s.spu_name ILIKE ${like} ESCAPE '\\' OR s.spu_name_en ILIKE ${like} ESCAPE '\\')`,
        );
      }
    }

    const where = Prisma.sql`WHERE ${Prisma.join(filters, " AND ")}`;
    const page = Math.max(1, query.page ?? 1);
    const requestedSize = query.pageSize ?? 0;
    const pageSize = (PAGE_SIZES as readonly number[]).includes(requestedSize) ? requestedSize : 20;
    const sortSql = SORT_SQL[query.sort ?? "coverage"] ?? SORT_SQL.coverage;

    const summaryRows = await this.prisma.$queryRaw<SummaryRow[]>`
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE s.coverage > 0)::int AS "withDetail",
             count(*) FILTER (WHERE s.coverage >= ${COVERAGE_DIMENSIONS.length})::int AS "fullCoverage",
             count(*) FILTER (WHERE s.has_sales)::int AS "withSales",
             count(*) FILTER (WHERE s.review_count > 0)::int AS "withReview"
      FROM pd_spu s
      ${where}
    `;
    const rows = await this.prisma.$queryRaw<ListRow[]>`
      SELECT ${LIST_COLUMNS}
      FROM pd_spu s
      ${where}
      ORDER BY ${sortSql}
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
    `;
    const [stateRows, coverageRows] = await Promise.all([
      this.prisma.$queryRaw<StateBucketRow[]>`
        SELECT s.spu_state AS code, count(*)::int AS count
        FROM pd_spu s
        ${where}
        GROUP BY 1
        ORDER BY 1
      `,
      this.prisma.$queryRaw<CoverageBucketRow[]>`
        SELECT s.coverage AS level, count(*)::int AS count
        FROM pd_spu s
        ${where}
        GROUP BY 1
        ORDER BY 1
      `,
    ]);

    const summary = summaryRows[0] ?? {
      total: 0,
      withDetail: 0,
      fullCoverage: 0,
      withSales: 0,
      withReview: 0,
    };
    const stateCounts = new Map(stateRows.map((row) => [row.code, row.count]));
    const coverageCounts = new Map(coverageRows.map((row) => [row.level, row.count]));
    return {
      items: rows.map((row) => this.toItem(row, user, salesStamp.asOf)),
      total: summary.total,
      page,
      pageSize,
      summary,
      /** 分布恒按全量（同 filter）聚合，与当前页无关；缺桶补 0 属于「计数」而非「造值」。 */
      breakdown: {
        state: SPU_STATES.map((item) => ({
          code: item.code,
          label: item.label,
          count: stateCounts.get(item.code) ?? 0,
        })),
        coverage: Array.from({ length: COVERAGE_DIMENSIONS.length + 1 }, (_, level) => ({
          level,
          count: coverageCounts.get(level) ?? 0,
        })),
      },
      scope: await this.access.scopeInfo(user),
    };
  }

  /** 精确命中集合：spu_code / sku_code / asin / 平台 SKU。命中非空时列表不做模糊匹配。 */
  private async exactSpuCodes(q: string): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ spuCode: string }[]>`
      SELECT DISTINCT t.spu_code AS "spuCode"
      FROM (
        SELECT s.spu_code FROM pd_spu s WHERE upper(s.spu_code) = upper(${q})
        UNION
        SELECT k.spu_code FROM pd_sku k
          WHERE upper(k.sku_code) = upper(${q}) AND k.spu_code IS NOT NULL
        UNION
        SELECT c.spu_code FROM sal_sku_code c
          WHERE (upper(c.asin) = upper(${q}) OR upper(c.sale_sku_code) = upper(${q}))
            AND c.spu_code IS NOT NULL
      ) t
      WHERE t.spu_code IS NOT NULL
    `;
    return rows.map((row) => row.spuCode);
  }

  private toItem(row: ListRow, user: AuthUser, salesAsOf: string | null) {
    const flags: Record<string, boolean> = {
      sku: row.skuCount > 0,
      channel: row.channelCount > 0,
      sales: row.hasSales,
      voc: row.reviewCount > 0,
    };
    return {
      spuCode: row.spuCode,
      spuName: row.spuName,
      spuNameEn: row.spuNameEn,
      spuImage: row.spuImage,
      brandCode: row.brandCode,
      categoryNameL1: row.categoryNameL1,
      categoryPath: categoryPath([
        row.categoryNameL1,
        row.categoryNameL2,
        row.categoryNameL3,
        row.categoryNameL4,
        row.categoryNameL5,
      ]),
      spuLevelNew: row.spuLevelNew,
      spuState: row.spuState,
      spuStateLabel: SPU_STATE_LABEL[row.spuState] ?? row.spuStateDesc ?? `状态 ${row.spuState}`,
      skuCount: row.skuCount,
      channelCount: row.channelCount,
      marketCountries: row.marketCountries,
      sales30dUsd: commercial(
        user,
        num(row.sales30dUsd) === null ? "empty" : "ready",
        SOURCE_TABLE_LABEL[SALES_TABLE],
        salesAsOf,
        num(row.sales30dUsd),
      ),
      reviewCount: row.reviewCount,
      coverage: row.coverage,
      coverageDimensions: COVERAGE_DIMENSIONS.filter((dimension) => flags[dimension.key]).map(
        (dimension) => dimension.key,
      ),
      updateTime: row.updateTime ? row.updateTime.toISOString() : null,
    };
  }
}
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

interface MarketBucketRow {
  code: string;
  count: number;
}

interface TreeRow {
  c1: string | null;
  n1: string | null;
  c2: string | null;
  n2: string | null;
  c3: string | null;
  n3: string | null;
  c4: string | null;
  n4: string | null;
  cnt: number;
}

export interface CategoryNode {
  value: string;
  label: string;
  count: number;
  children?: CategoryNode[];
}

interface TreeBuilder {
  node: CategoryNode;
  kids: Map<string, TreeBuilder>;
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

/**
 * 类目各级身份：编码优先，编码为空时退化为名称（生产库 1067 行里 123 行只有名称）。
 * 逐级写死列名，不接受任何拼接。
 */
const CATEGORY_LEVEL_KEYS = [
  Prisma.sql`COALESCE(NULLIF(s.category_code_level1, ''), NULLIF(s.category_name_level1, ''))`,
  Prisma.sql`COALESCE(NULLIF(s.category_code_level2, ''), NULLIF(s.category_name_level2, ''))`,
  Prisma.sql`COALESCE(NULLIF(s.category_code_level3, ''), NULLIF(s.category_name_level3, ''))`,
  Prisma.sql`COALESCE(NULLIF(s.category_code_level4, ''), NULLIF(s.category_name_level4, ''))`,
];

/** 一级类目身份，与 CATEGORY_LEVEL_KEYS[0] 同源。 */
const CATEGORY_KEY = CATEGORY_LEVEL_KEYS[0];

/** 类目树最多四级：L5 在源表 100% 为空，不暴露。 */
const CATEGORY_LEVELS = CATEGORY_LEVEL_KEYS.length;

/** 树节点名：与身份同源，编码缺失时用名称；名称也缺失时用编码兜底。 */
const CATEGORY_LEVEL_NAMES = [
  Prisma.sql`COALESCE(NULLIF(s.category_name_level1, ''), s.category_code_level1)`,
  Prisma.sql`COALESCE(NULLIF(s.category_name_level2, ''), s.category_code_level2)`,
  Prisma.sql`COALESCE(NULLIF(s.category_name_level3, ''), s.category_code_level3)`,
  Prisma.sql`COALESCE(NULLIF(s.category_name_level4, ''), s.category_code_level4)`,
];

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

  /**
   * 四级类目树。一次返回整棵树（生产约 520 个节点，无需懒加载）。
   * 树必须从 scope 过滤后的数据算：employee 角色不能看到无权类目的名称。
   */
  async categoryTree(user: AuthUser) {
    const scope = await this.access.scopeSql(user);
    const rows = await this.prisma.$queryRaw<TreeRow[]>`
      SELECT
        ${CATEGORY_LEVEL_KEYS[0]} AS c1,
        ${CATEGORY_LEVEL_NAMES[0]} AS n1,
        ${CATEGORY_LEVEL_KEYS[1]} AS c2,
        ${CATEGORY_LEVEL_NAMES[1]} AS n2,
        ${CATEGORY_LEVEL_KEYS[2]} AS c3,
        ${CATEGORY_LEVEL_NAMES[2]} AS n3,
        ${CATEGORY_LEVEL_KEYS[3]} AS c4,
        ${CATEGORY_LEVEL_NAMES[3]} AS n4,
        count(*)::int AS cnt
      FROM pd_spu s
      WHERE ${scope}
      GROUP BY 1, 2, 3, 4, 5, 6, 7, 8
    `;
    // 节点 value 用该级身份（编码优先），无跨父重码（已实测），故不必拼路径。
    const roots = new Map<string, TreeBuilder>();
    for (const row of rows) {
      const levels: [string | null, string | null][] = [
        [row.c1, row.n1],
        [row.c2, row.n2],
        [row.c3, row.n3],
        [row.c4, row.n4],
      ];
      // 只维护 kids 引用，父子关系留给 finalize 一次性重建。
      let siblings = roots;
      for (const [code, name] of levels) {
        if (!code || !name) break;
        let builder = siblings.get(code);
        if (!builder) {
          builder = { node: { value: code, label: name, count: 0 }, kids: new Map() };
          siblings.set(code, builder);
        }
        builder.node.count += row.cnt;
        siblings = builder.kids;
      }
    }
    // 收尾：kids 非空才挂 children（空数组会让 Cascader 画出假的展开箭头）。
    const finalize = (builder: TreeBuilder): CategoryNode => {
      const kids = [...builder.kids.values()]
        .map(finalize)
        .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
      return kids.length
        ? { ...builder.node, children: kids }
        : { value: builder.node.value, label: builder.node.label, count: builder.node.count };
    };
    return {
      levels: CATEGORY_LEVELS,
      total: [...roots.values()].reduce((sum, item) => sum + item.node.count, 0),
      tree: [...roots.values()]
        .map(finalize)
        .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value)),
    };
  }

  async list(user: AuthUser, query: ProductListQuery) {
    const [scopeFilter, salesStamp] = await Promise.all([
      this.access.scopeSql(user),
      this.sources.stamp(SALES_TABLE),
    ]);
    const filters: Prisma.Sql[] = [scopeFilter];

    if (query.brand) filters.push(Prisma.sql`s.brand_code = ${query.brand}`);
    // category 支持 "/" 分段：第 1 段命中一级、第 2 段命中二级……段数即层级。
    // 逐段都 AND 上级，天然防跳级；单段时与 P1 的 category=<一级> 完全等价。
    const categoryParts = (query.category ?? "").split("/").filter(Boolean).slice(0, CATEGORY_LEVELS);
    categoryParts.forEach((part, level) => {
      filters.push(Prisma.sql`${CATEGORY_LEVEL_KEYS[level]} = ${part}`);
    });
    if (query.state !== undefined) filters.push(Prisma.sql`s.spu_state = ${query.state}`);
    const marketFilter = query.market
      ? Prisma.sql`${query.market} = ANY(s.market_countries)`
      : null;
    if (marketFilter) filters.push(marketFilter);

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
    // 市场选项必须来自「未被 market 自身收窄」的范围，否则选完只剩一个选项、无法切换。
    // state/coverage 的 facets 仍然吃完整 where（保持 P1 既有语义不变）。
    const whereNoMarket = Prisma.sql`WHERE ${Prisma.join(
      filters.filter((item) => item !== marketFilter),
      " AND ",
    )}`;
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
    const [stateRows, coverageRows, marketRows] = await Promise.all([
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
      this.prisma.$queryRaw<MarketBucketRow[]>`
        SELECT m AS code, count(*)::int AS count
        FROM pd_spu s, unnest(s.market_countries) AS m
        ${whereNoMarket}
        GROUP BY 1
        ORDER BY 2 DESC, 1 ASC
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
        /** 市场分布：只列真实出现的市场码，不补 0（没出现就是没有该市场的商品）。 */
        markets: marketRows,
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
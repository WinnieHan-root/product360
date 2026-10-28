import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "./prisma.service";
import type { AuthUser } from "./auth-user";

/** pd_spu 上的类目编码列，用于把「一级/任意级类目」范围向下展开到所有后代 SPU */
const CATEGORY_COLUMNS = [
  "s.category_code",
  "s.category_code_level1",
  "s.category_code_level2",
  "s.category_code_level3",
  "s.category_code_level4",
  "s.category_code_level5",
] as const;

export interface ScopeInfo {
  mode: "all" | "brand" | "category" | "mixed" | "none";
  brands: string[];
  categories: string[];
}

@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  async scopeInfo(user: AuthUser): Promise<ScopeInfo> {
    if (user.role === "platform_admin") return { mode: "all", brands: [], categories: [] };
    const scopes = await this.prisma.userScope.findMany({ where: { userId: user.id } });
    const brands = scopes.filter((s) => s.scopeType === "brand").map((s) => s.scopeCode);
    const categories = scopes.filter((s) => s.scopeType === "category").map((s) => s.scopeCode);
    if (brands.length && categories.length) return { mode: "mixed", brands, categories };
    if (brands.length) return { mode: "brand", brands, categories };
    if (categories.length) return { mode: "category", brands, categories };
    return { mode: "none", brands, categories };
  }

  /**
   * 范围 SQL 片段（别名固定为 s，即 pd_spu）。
   * 品牌范围命中 brand_code；类目范围命中该编码在任意层级的 SPU，即天然包含全部下级类目。
   */
  async scopeSql(user: AuthUser): Promise<Prisma.Sql> {
    const info = await this.scopeInfo(user);
    if (info.mode === "all") return Prisma.sql`TRUE`;
    const parts: Prisma.Sql[] = [];
    if (info.brands.length) {
      parts.push(Prisma.sql`s.brand_code IN (${Prisma.join(info.brands)})`);
    }
    if (info.categories.length) {
      const ors = CATEGORY_COLUMNS.map(
        (column) => Prisma.sql`${Prisma.raw(column)} IN (${Prisma.join(info.categories)})`,
      );
      parts.push(Prisma.sql`(${Prisma.join(ors, " OR ")})`);
    }
    if (!parts.length) return Prisma.sql`FALSE`;
    return Prisma.sql`(${Prisma.join(parts, " OR ")})`;
  }

  /** 越权返回 403，不存在返回 404，语义不合并 */
  async requireProduct(spuCode: string, user: AuthUser): Promise<string> {
    const scope = await this.scopeSql(user);
    const visible = await this.prisma.$queryRaw<{ spuCode: string }[]>`
      SELECT s.spu_code AS "spuCode" FROM pd_spu s WHERE s.spu_code = ${spuCode} AND ${scope} LIMIT 1
    `;
    if (visible.length) return visible[0].spuCode;
    const exists = await this.prisma.pdSpu.findUnique({
      where: { spuCode },
      select: { spuCode: true },
    });
    if (!exists) throw new NotFoundException("未找到商品");
    throw new ForbiddenException("无权查看该商品");
  }
}

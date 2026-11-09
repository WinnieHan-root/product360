import { Controller, Get, Query, Req } from "@nestjs/common";
import type { AuthUser } from "../common/auth-user";
import { ProductListQuery } from "./catalog.dto";
import { CatalogService } from "./catalog.service";

@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get("meta/brands")
  brands(@Req() req: { user: AuthUser }) {
    return this.catalog.brands(req.user);
  }

  @Get("meta/categories")
  categories(@Req() req: { user: AuthUser }) {
    return this.catalog.categories(req.user);
  }

  /** 四级类目树，一次返回全树（约 520 节点） */
  @Get("meta/categories/tree")
  categoryTree(@Req() req: { user: AuthUser }) {
    return this.catalog.categoryTree(req.user);
  }

  @Get("products")
  list(@Req() req: { user: AuthUser }, @Query() query: ProductListQuery) {
    return this.catalog.list(req.user, query);
  }
}

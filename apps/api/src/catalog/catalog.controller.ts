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

  @Get("products")
  list(@Req() req: { user: AuthUser }, @Query() query: ProductListQuery) {
    return this.catalog.list(req.user, query);
  }
}

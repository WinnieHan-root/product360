import { Controller, Get, Param, Query, Req } from "@nestjs/common";
import type { AuthUser } from "../common/auth-user";
import { ExternalQuery } from "./external.dto";
import { ExternalService } from "./external.service";

@Controller("products")
export class ExternalController {
  constructor(private readonly external: ExternalService) {}

  @Get(":spu/external")
  get(@Param("spu") spu: string, @Query() query: ExternalQuery, @Req() req: { user: AuthUser }) {
    return this.external.get(spu, req.user, query.days ?? 30);
  }
}

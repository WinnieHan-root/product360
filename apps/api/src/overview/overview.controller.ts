import { Controller, Get, Param, Req } from "@nestjs/common";
import type { AuthUser } from "../common/auth-user";
import { OverviewService } from "./overview.service";

@Controller("products")
export class OverviewController {
  constructor(private readonly overview: OverviewService) {}

  @Get(":spu/overview")
  get(@Param("spu") spu: string, @Req() req: { user: AuthUser }) {
    return this.overview.get(spu, req.user);
  }
}

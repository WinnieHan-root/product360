import { Controller, Get, Param, Query, Req } from "@nestjs/common";
import type { AuthUser } from "../common/auth-user";
import { DaysQuery } from "./channels.dto";
import { ChannelsService } from "./channels.service";

@Controller("products")
export class ChannelsController {
  constructor(private readonly channels: ChannelsService) {}

  @Get(":spu/channels")
  get(@Param("spu") spu: string, @Query() query: DaysQuery, @Req() req: { user: AuthUser }) {
    return this.channels.get(spu, req.user, query.days ?? 30);
  }
}

import { Controller, Get, Param, Query, Req } from "@nestjs/common";
import type { AuthUser } from "../common/auth-user";
import { DaysQuery, ListingsQuery } from "./channels.dto";
import { ChannelsService } from "./channels.service";

@Controller("products")
export class ChannelsController {
  constructor(private readonly channels: ChannelsService) {}

  @Get(":spu/channels")
  get(@Param("spu") spu: string, @Query() query: DaysQuery, @Req() req: { user: AuthUser }) {
    return this.channels.get(spu, req.user, query.days ?? 30);
  }

  /** P2-4 在线 listing 明细，默认只看 online（offline 不维护内容属正常） */
  @Get(":spu/channels/listings")
  listings(
    @Param("spu") spu: string,
    @Query() query: ListingsQuery,
    @Req() req: { user: AuthUser },
  ) {
    return this.channels.listings(spu, req.user, query.status ?? "online");
  }
}

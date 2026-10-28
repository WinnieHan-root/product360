import { Controller, Get, Param, Query, Req } from "@nestjs/common";
import type { AuthUser } from "../common/auth-user";
import { ChannelsService } from "../channels/channels.service";
import { DaysQuery } from "../channels/channels.dto";
import { ExternalService } from "../external/external.service";
import { OverviewService } from "../overview/overview.service";

@Controller("products")
export class ContextController {
  constructor(
    private readonly overview: OverviewService,
    private readonly channels: ChannelsService,
    private readonly external: ExternalService,
  ) {}

  /** Agent 只调这一个端点拿全量上下文；不再返回 keywords */
  @Get(":spu/context")
  async get(@Param("spu") spu: string, @Query() query: DaysQuery, @Req() req: { user: AuthUser }) {
    const days = query.days ?? 30;
    const [overview, channels, external] = await Promise.all([
      this.overview.get(spu, req.user),
      this.channels.get(spu, req.user, days),
      this.external.get(spu, req.user, days),
    ]);
    return { overview, channels, external };
  }
}
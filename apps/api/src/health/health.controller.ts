import { Controller, Get } from "@nestjs/common";
import { Public } from "../auth/public.decorator";
import { PrismaService } from "../common/prisma.service";

/**
 * 部署健康检查：容器 healthcheck、Nginx 反代验收、上线后冒烟都用它。
 * 只读一次 count，不触发业务查询，也不返回任何商业字段。
 */
@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async check() {
    const rows = await this.prisma.$queryRaw<Array<{ count: number }>>`
      SELECT count(*)::int AS count FROM pd_spu
    `;
    return {
      status: "ok",
      products: rows[0]?.count ?? 0,
      checkedAt: new Date().toISOString(),
    };
  }
}

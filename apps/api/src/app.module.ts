import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AuthModule } from "./auth/auth.module";
import { JwtAuthGuard } from "./auth/jwt-auth.guard";
import { CatalogModule } from "./catalog/catalog.module";
import { ChannelsModule } from "./channels/channels.module";
import { ContextModule } from "./context/context.module";
import { AccessModule } from "./common/access.module";
import { PrismaModule } from "./common/prisma.module";
import { ExternalModule } from "./external/external.module";
import { HealthModule } from "./health/health.module";
import { OverviewModule } from "./overview/overview.module";

@Module({
  imports: [
    PrismaModule,
    AccessModule,
    AuthModule,
    CatalogModule,
    OverviewModule,
    ChannelsModule,
    ExternalModule,
    ContextModule,
    HealthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }],
})
export class AppModule {}

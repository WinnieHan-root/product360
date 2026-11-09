import { Module } from "@nestjs/common";
import { OverviewController } from "./overview.controller";
import { OverviewService } from "./overview.service";
import { QualityService } from "./quality.service";

@Module({
  controllers: [OverviewController],
  providers: [OverviewService, QualityService],
  exports: [OverviewService],
})
export class OverviewModule {}
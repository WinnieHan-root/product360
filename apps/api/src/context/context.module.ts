import { Module } from "@nestjs/common";
import { ChannelsModule } from "../channels/channels.module";
import { ExternalModule } from "../external/external.module";
import { OverviewModule } from "../overview/overview.module";
import { ContextController } from "./context.controller";

@Module({
  imports: [OverviewModule, ChannelsModule, ExternalModule],
  controllers: [ContextController],
})
export class ContextModule {}

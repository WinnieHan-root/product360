import { Module } from "@nestjs/common";
import { ExternalController } from "./external.controller";
import { ExternalService } from "./external.service";

@Module({
  controllers: [ExternalController],
  providers: [ExternalService],
  exports: [ExternalService],
})
export class ExternalModule {}

import { Global, Module } from "@nestjs/common";
import { AccessService } from "./access.service";
import { SourceService } from "./source.service";

@Global()
@Module({
  providers: [AccessService, SourceService],
  exports: [AccessService, SourceService],
})
export class AccessModule {}

import { Type } from "class-transformer";
import { IsInt, IsOptional } from "class-validator";

/** 越界不报错，由 Service 回落到默认 30 天 */
export class ExternalQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  days?: number;
}
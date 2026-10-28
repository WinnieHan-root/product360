import { Type } from "class-transformer";
import { IsInt, IsOptional } from "class-validator";

/** 越界不报错，由 Service 回落到默认 30 天，避免筛选控件触发 400 */
export class DaysQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  days?: number;
}
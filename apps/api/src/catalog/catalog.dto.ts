import { Transform, Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from "class-validator";

/** pd_spu.spu_state 的可选值，来自 shared/SPU_STATES，不接受其它值。 */
const STATE_CODES = [0, 1, 2, 3, 5];
const SORTS = ["coverage", "updateTime", "sales30d", "reviewCount"];

export class ProductListQuery {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  brand?: string;

  /** 类目路径，"/" 分隔，1~4 段（第 N 段命中第 N 级类目）。单段等价于旧的一级类目筛选。 */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  category?: string;

  /** 市场二字码（US / DE / JP …）：命中 pd_spu.market_countries 任一元素。 */
  @IsOptional()
  @IsString()
  @MaxLength(4)
  market?: string;

  @IsOptional()
  @Transform(({ value }) => (value === "" || value == null ? undefined : Number(value)))
  @IsIn(STATE_CODES)
  state?: number;

  @IsOptional()
  @IsIn(SORTS)
  sort?: "coverage" | "updateTime" | "sales30d" | "reviewCount";

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  /** 非 20/50/100 不报错，由 Service 回落到默认值 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  pageSize?: number;
}
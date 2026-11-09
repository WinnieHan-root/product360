import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional } from "class-validator";

/** 越界不报错，由 Service 回落到默认 30 天，避免筛选控件触发 400 */
export class DaysQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  days?: number;
}

/**
 * listing 状态过滤。
 * - online：仅在线（默认，见 p2-enhancement-design §4.3——offline 749 行里 421 行缺描述，
 *   混在一起看完整度列全是噪声）
 * - all：全部
 * - offline：仅下架
 * - deleted：仅已删除（源端自己打的标，raw 与 offline 相同，不是从 raw 推出来的）
 * - draft：仅草稿（Shopify 店铺里已建好但未发布，内容多半已填满，不能并入 offline）
 */
export const LISTING_STATUS_FILTERS = ["online", "all", "offline", "draft", "deleted"] as const;

export class ListingsQuery {
  @IsOptional()
  @IsIn(LISTING_STATUS_FILTERS)
  status?: (typeof LISTING_STATUS_FILTERS)[number];
}
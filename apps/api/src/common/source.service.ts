import { Injectable } from "@nestjs/common";
import type { DataStatus } from "@product360/shared";
import { PrismaService } from "./prisma.service";

export interface SourceStamp {
  /** 该源表最近一次成功批次的 ds（YYYY-MM-DD） */
  asOf: string | null;
  /** 距今是否超过 48 小时，超过则页面应显示「数据延迟」 */
  delayed: boolean;
}

const CACHE_TTL_MS = 30_000;
const DELAY_THRESHOLD_MS = 48 * 60 * 60 * 1000;

/**
 * 数据日期来源。取代原先直接从 StarRocks 分区取 asOf 的做法，统一读 sync_batch。
 */
@Injectable()
export class SourceService {
  private readonly cache = new Map<string, { at: number; stamp: SourceStamp }>();

  constructor(private readonly prisma: PrismaService) {}

  async stamp(sourceTable: string): Promise<SourceStamp> {
    const hit = this.cache.get(sourceTable);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.stamp;

    const row = await this.prisma.syncBatch.findFirst({
      where: { sourceTable, status: "success" },
      orderBy: { finishedAt: "desc" },
      select: { sourceDs: true, finishedAt: true },
    });
    const delayed = row?.finishedAt
      ? Date.now() - row.finishedAt.getTime() > DELAY_THRESHOLD_MS
      : true;
    const stamp: SourceStamp = {
      asOf: row?.sourceDs ? row.sourceDs.toISOString().slice(0, 10) : null,
      delayed,
    };
    this.cache.set(sourceTable, { at: Date.now(), stamp });
    return stamp;
  }

  async stamps(sourceTables: string[]): Promise<Map<string, SourceStamp>> {
    const entries = await Promise.all(
      sourceTables.map(async (table) => [table, await this.stamp(table)] as const),
    );
    return new Map(entries);
  }

  /** 状态修正：有数据但批次延迟 → delayed */
  resolve(status: DataStatus, stamp: SourceStamp): DataStatus {
    if (status === "ready" && stamp.delayed) return "delayed";
    return status;
  }

  invalidate(): void {
    this.cache.clear();
  }
}

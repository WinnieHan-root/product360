import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { NPS_SENTIMENTS, SOURCE_TABLE_LABEL } from "@product360/shared";
import { AccessService } from "../common/access.service";
import type { AuthUser } from "../common/auth-user";
import { commercial, dayKey, round } from "../common/field";
import { PrismaService } from "../common/prisma.service";
import { SourceService } from "../common/source.service";

const NPS_TABLE = "dws_cs_voc_nps_review_df";
const TICKET_TABLE = "dwb_cs_voc_record_channel_hf";
const NPS_SOURCE = SOURCE_TABLE_LABEL[NPS_TABLE];
const TICKET_SOURCE = SOURCE_TABLE_LABEL[TICKET_TABLE];

const MIN_DAYS = 7;
const MAX_DAYS = 90;
const DEFAULT_DAYS = 30;

const TICKET_NOTE = "工单表 rating 恒为 0，只用于主题分类，不参与星级";
const COMPETITOR_NOTE = "仅统计 is_own_brand = 0 的竞品行，自有品牌不混入";

interface TotalRow {
  ratingAvg: Prisma.Decimal | null;
  reviewCount: number | null;
  dayCount: number;
}

interface DayRow {
  day: Date;
  ratingAvg: Prisma.Decimal | null;
  reviewCount: number | null;
}

interface SentimentRow {
  bucket: number;
  sentiment: string;
  itemCount: number;
  ratio: Prisma.Decimal;
}

interface TagRow {
  tagName: string;
  sentiment: string | null;
  tagCount: number;
  ratio: Prisma.Decimal;
}

interface TicketRow {
  topic: string;
  vocType: string | null;
  ticketCount: number;
  ratio: Prisma.Decimal;
}

interface CompetitorRow {
  brandName: string;
  vocModel: string | null;
  ratingAvg: Prisma.Decimal;
  reviewCount: number;
}

function startOfUtcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function addDays(value: Date, days: number): Date {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

@Injectable()
export class ExternalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly sources: SourceService,
  ) {}

  async get(spu: string, user: AuthUser, days = DEFAULT_DAYS) {
    const spuCode = await this.access.requireProduct(spu, user);
    const span = days >= MIN_DAYS && days <= MAX_DAYS ? Math.trunc(days) : DEFAULT_DAYS;
    const [stampNps, stampTicket] = await Promise.all([
      this.sources.stamp(NPS_TABLE),
      this.sources.stamp(TICKET_TABLE),
    ]);

    const bounds = await this.prisma.$queryRaw<{ to: Date | null }[]>`
      SELECT max(review_date) AS "to" FROM voc_review_day WHERE spu_code = ${spuCode}
    `;
    const to = startOfUtcDay(bounds[0]?.to ?? new Date());
    const from = addDays(to, -(span - 1));
    const labels = Array.from({ length: span }, (_, index) => dayKey(addDays(from, index)));

    const [totals, dayRows, sentiments, tags, tickets, competitors] = await Promise.all([
      this.prisma.$queryRaw<TotalRow[]>`
        SELECT sum(rating_avg * review_count) / NULLIF(sum(review_count), 0) AS "ratingAvg",
               sum(review_count)::int AS "reviewCount",
               count(*)::int AS "dayCount"
        FROM voc_review_day
        WHERE spu_code = ${spuCode}
      `,
      this.prisma.$queryRaw<DayRow[]>`
        SELECT review_date AS day,
               sum(rating_avg * review_count) / NULLIF(sum(review_count), 0) AS "ratingAvg",
               sum(review_count)::int AS "reviewCount"
        FROM voc_review_day
        WHERE spu_code = ${spuCode} AND review_date BETWEEN ${from} AND ${to}
        GROUP BY 1
        ORDER BY 1
      `,
      this.prisma.$queryRaw<SentimentRow[]>`
        SELECT bucket, sentiment, item_count AS "itemCount", ratio
        FROM voc_nps_sentiment
        WHERE spu_code = ${spuCode}
        ORDER BY bucket
      `,
      this.prisma.$queryRaw<TagRow[]>`
        SELECT tag_name AS "tagName", sentiment, tag_count AS "tagCount", ratio
        FROM voc_nps_tag
        WHERE spu_code = ${spuCode}
        ORDER BY tag_count DESC, tag_name ASC
      `,
      this.prisma.$queryRaw<TicketRow[]>`
        SELECT topic, voc_type AS "vocType", ticket_count AS "ticketCount", ratio
        FROM voc_ticket_topic
        WHERE spu_code = ${spuCode}
        ORDER BY ticket_count DESC, topic ASC
      `,
      this.prisma.$queryRaw<CompetitorRow[]>`
        SELECT brand_name AS "brandName", voc_model AS "vocModel",
               rating_avg AS "ratingAvg", review_count AS "reviewCount"
        FROM voc_competitor
        WHERE spu_code = ${spuCode}
        ORDER BY review_count DESC, brand_name ASC
      `,
    ]);

    const total = totals[0];
    const ratingAvg = total?.ratingAvg == null ? null : round(Number(total.ratingAvg), 2);
    const reviewCount = total?.reviewCount ?? null;
    const reviewStatus = ratingAvg !== null ? "ready" : "empty";

    const sentimentByBucket = new Map(sentiments.map((row) => [row.bucket, row]));
    const dayMap = new Map(dayRows.map((row) => [dayKey(row.day), row]));

    return {
      window: { days: span, from: dayKey(from), to: dayKey(to) },
      review: {
        ratingAvg: commercial(user, reviewStatus, NPS_SOURCE, stampNps.asOf, ratingAvg),
        reviewCount: commercial(user, reviewStatus, NPS_SOURCE, stampNps.asOf, reviewCount),
        sentiments: NPS_SENTIMENTS.map((item) => {
          const row = sentimentByBucket.get(item.bucket);
          return {
            bucket: item.bucket,
            sentiment: row?.sentiment ?? item.sentiment,
            count: user.canViewCommercial ? (row?.itemCount ?? 0) : null,
            ratio: user.canViewCommercial ? (row ? round(Number(row.ratio), 4) : 0) : null,
          };
        }),
        sentimentStatus: this.sources.resolve(sentiments.length ? "ready" : "empty", stampNps),
        tags: tags.map((row) => ({
          tagName: row.tagName,
          sentiment: row.sentiment,
          count: row.tagCount,
          ratio: round(Number(row.ratio), 4),
        })),
        tagsStatus: this.sources.resolve(tags.length ? "ready" : "empty", stampNps),
        trend: user.canViewCommercial
          ? {
              labels,
              ratingAvg: labels.map((label) => {
                const value = dayMap.get(label)?.ratingAvg;
                return value == null ? null : round(Number(value), 2);
              }),
              reviewCount: labels.map((label) => dayMap.get(label)?.reviewCount ?? null),
              status: this.sources.resolve(dayRows.length ? "ready" : "empty", stampNps),
              source: NPS_SOURCE,
              asOf: stampNps.asOf,
            }
          : {
              labels,
              ratingAvg: [],
              reviewCount: [],
              status: "no_access" as const,
              source: NPS_SOURCE,
              asOf: stampNps.asOf,
            },
      },
      tickets: {
        status: this.sources.resolve(tickets.length ? "ready" : "empty", stampTicket),
        total: tickets.length ? tickets.reduce((sum, row) => sum + row.ticketCount, 0) : null,
        topics: tickets.map((row) => ({
          topic: row.topic,
          vocType: row.vocType,
          ticketCount: row.ticketCount,
          ratio: round(Number(row.ratio), 4),
        })),
        source: TICKET_SOURCE,
        asOf: stampTicket.asOf,
        note: TICKET_NOTE,
      },
      competitors: {
        status: this.sources.resolve(competitors.length ? "ready" : "empty", stampNps),
        rows: competitors.map((row) => ({
          brandName: row.brandName,
          vocModel: row.vocModel,
          ratingAvg: user.canViewCommercial ? round(Number(row.ratingAvg), 2) : null,
          reviewCount: user.canViewCommercial ? row.reviewCount : null,
        })),
        source: NPS_SOURCE,
        asOf: stampNps.asOf,
        note: COMPETITOR_NOTE,
      },
    };
  }
}
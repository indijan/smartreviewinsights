import { prisma } from "@/lib/prisma";

export async function getTrafficLabDashboard(days = 30) {
  const interval = `${Math.max(1, days)} days`;

  const [clicks, impressions, topTrafficOffers, topTrafficPages, placementCtrRows, campaignRows, costs, revenue, niches, funnels] = await Promise.all([
    prisma.$queryRawUnsafe<Array<{ total: number }>>(
      `
      SELECT COALESCE(COUNT(*), 0)::int AS total
      FROM "ClickEvent"
      WHERE "createdAt" >= now() - ($1::text)::interval
      `,
      interval,
    ),
    prisma.$queryRawUnsafe<Array<{ total: number }>>(
      `
      SELECT COALESCE(COUNT(*), 0)::int AS total
      FROM "ImpressionEvent"
      WHERE "createdAt" >= now() - ($1::text)::interval
      `,
      interval,
    ),
    prisma.$queryRawUnsafe<Array<{ slug: string; name: string; clicks: number }>>(
      `
      SELECT t.slug, t.name, COUNT(c.id)::int AS clicks
      FROM "ClickEvent" c
      JOIN "TrafficOffer" t ON t.id = c."trafficOfferId"
      WHERE c."createdAt" >= now() - ($1::text)::interval
      GROUP BY t.id
      ORDER BY clicks DESC
      LIMIT 10
      `,
      interval,
    ),
    prisma.$queryRawUnsafe<Array<{ slug: string; title: string; clicks: number }>>(
      `
      SELECT p.slug, p.title, COUNT(c.id)::int AS clicks
      FROM "ClickEvent" c
      JOIN "Page" p ON p.id = c."pageId"
      WHERE c."createdAt" >= now() - ($1::text)::interval
      GROUP BY p.id
      ORDER BY clicks DESC
      LIMIT 10
      `,
      interval,
    ),
    prisma.$queryRawUnsafe<Array<{ placement_slug: string; placement_name: string; impressions: number; clicks: number; ctr: number }>>(
      `
      WITH imp AS (
        SELECT i."placementId", COUNT(*)::int AS impressions
        FROM "ImpressionEvent" i
        WHERE i."createdAt" >= now() - ($1::text)::interval
        GROUP BY i."placementId"
      ),
      clk AS (
        SELECT c."placementId", COUNT(*)::int AS clicks
        FROM "ClickEvent" c
        WHERE c."createdAt" >= now() - ($1::text)::interval
        GROUP BY c."placementId"
      )
      SELECT
        p.slug AS placement_slug,
        p.name AS placement_name,
        COALESCE(imp.impressions, 0)::int AS impressions,
        COALESCE(clk.clicks, 0)::int AS clicks,
        CASE WHEN COALESCE(imp.impressions, 0) > 0
          THEN ROUND((COALESCE(clk.clicks, 0)::numeric / imp.impressions::numeric) * 100, 2)::float8
          ELSE 0::float8
        END AS ctr
      FROM "TrafficPlacement" p
      LEFT JOIN imp ON imp."placementId" = p.id
      LEFT JOIN clk ON clk."placementId" = p.id
      WHERE p.status = 'active'
      ORDER BY ctr DESC, clicks DESC, impressions DESC
      LIMIT 10
      `,
      interval,
    ),
    prisma.$queryRawUnsafe<Array<{ utm_campaign: string; spend: number; revenue: number; profit: number }>>(
      `
      WITH cost AS (
        SELECT COALESCE("utmCampaign", '') AS utm_campaign, COALESCE(SUM(spend), 0)::float8 AS spend
        FROM "TrafficCampaignCost"
        WHERE date >= now() - ($1::text)::interval
        GROUP BY COALESCE("utmCampaign", '')
      ),
      rev AS (
        SELECT COALESCE(NULLIF(split_part(COALESCE("pagePath", ''), '?utm_campaign=', 2), ''), '') AS utm_campaign,
               COALESCE(SUM(revenue), 0)::float8 AS revenue
        FROM "TrafficRevenueImport"
        WHERE date >= now() - ($1::text)::interval
        GROUP BY COALESCE(NULLIF(split_part(COALESCE("pagePath", ''), '?utm_campaign=', 2), ''), '')
      )
      SELECT
        COALESCE(cost.utm_campaign, rev.utm_campaign, '(unmapped)') AS utm_campaign,
        COALESCE(cost.spend, 0)::float8 AS spend,
        COALESCE(rev.revenue, 0)::float8 AS revenue,
        (COALESCE(rev.revenue, 0) - COALESCE(cost.spend, 0))::float8 AS profit
      FROM cost
      FULL OUTER JOIN rev ON rev.utm_campaign = cost.utm_campaign
      ORDER BY spend DESC, revenue DESC
      LIMIT 10
      `,
      interval,
    ),
    prisma.$queryRawUnsafe<Array<{ total: number }>>(
      `
      SELECT COALESCE(SUM(spend), 0)::float8 AS total
      FROM "TrafficCampaignCost"
      WHERE date >= now() - ($1::text)::interval
      `,
      interval,
    ),
    prisma.$queryRawUnsafe<Array<{ total: number }>>(
      `
      SELECT COALESCE(SUM(revenue), 0)::float8 AS total
      FROM "TrafficRevenueImport"
      WHERE date >= now() - ($1::text)::interval
      `,
      interval,
    ),
    prisma.trafficNiche.findMany({ orderBy: [{ updatedAt: "desc" }], take: 12 }),
    prisma.trafficFunnel.findMany({ orderBy: [{ updatedAt: "desc" }], take: 12, include: { niche: true } }),
  ]);

  const totalClicks = clicks[0]?.total ?? 0;
  const totalImpressions = impressions[0]?.total ?? 0;
  const totalCost = Number(costs[0]?.total ?? 0);
  const totalRevenue = Number(revenue[0]?.total ?? 0);
  const epv = totalClicks > 0 ? totalRevenue / totalClicks : 0;
  const profit = totalRevenue - totalCost;
  const outboundCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  const inboundCpc = totalClicks > 0 ? totalCost / totalClicks : 0;
  const marginPercent = totalCost > 0 ? (profit / totalCost) * 100 : 0;
  const hasMeaningfulVolume = totalImpressions >= 100 && totalClicks >= 10;
  const decision =
    totalCost === 0 && totalRevenue === 0
      ? "NO_DATA"
      : !hasMeaningfulVolume
        ? "KEEP_TESTING"
      : profit < 0 || (totalCost > 0 && totalRevenue < totalCost) || (inboundCpc > epv && totalCost > 0)
        ? "KILL"
        : outboundCtr >= 3 && profit > 0 && epv > inboundCpc
          ? "SCALE"
          : "KEEP_TESTING";

  return {
    totalClicks,
    totalImpressions,
    totalCost,
    totalRevenue,
    epv,
    profit,
    outboundCtr,
    inboundCpc,
    marginPercent,
    hasMeaningfulVolume,
    decision,
    topTrafficOffers,
    topTrafficPages,
    placementCtrRows,
    campaignRows,
    niches,
    funnels,
  };
}

export function normalizeSlugValue(input: string) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

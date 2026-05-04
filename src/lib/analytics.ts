import { prisma } from "@/lib/prisma";
import { getActiveTrafficPlacementsForPage } from "@/lib/pages";
import { getSearchConsoleAudit, getSearchConsolePageInsight, getSearchConsolePageMetrics, getSearchConsolePageQueryMetrics } from "@/lib/search-console";

export type DailyClicksRow = {
  day: string;
  clicks: number;
};

export type TopPageRow = {
  slug: string;
  title: string;
  clicks: number;
};

export type TopOfferRow = {
  id: string;
  title: string | null;
  source: string;
  canonicalName: string;
  clicks: number;
};

export type OpportunityPageRow = {
  id: string;
  slug: string;
  title: string;
  type: string;
  publishedAt: Date | null;
  updatedAt: Date;
  category: string | null;
  clicks: number;
  freshnessDays: number;
  pageTypeScore: number;
  categoryFitScore: number;
  queryIntentScore: number;
  opportunityScore: number;
  confidence: "analytics-only" | "hybrid";
  recommendation: "WATCH" | "PLACE_EXIT" | "DOUBLE_DOWN";
  gscClicks: number | null;
  gscImpressions: number | null;
  gscCtr: number | null;
  gscPosition: number | null;
  activeExitLayer: boolean;
};

export type OpportunityQueryRow = {
  query: string;
  pageId: string | null;
  pageSlug: string | null;
  pageTitle: string | null;
  pageCategory: string | null;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  intentScore: number;
  recommendation: "WATCH" | "PLACE_EXIT" | "DOUBLE_DOWN";
};

const HIGH_INTENT_PATTERNS = [
  /\bbest\b/i,
  /\breview\b/i,
  /\breviews\b/i,
  /\bvs\b/i,
  /\bcompare\b/i,
  /\bcomparison\b/i,
  /\bworth it\b/i,
  /\bunder\b/i,
  /\bbudget\b/i,
  /\bbuy\b/i,
  /\bbuying\b/i,
  /\btop\b/i,
  /\balternative\b/i,
  /\balternatives\b/i,
];

const MID_INTENT_PATTERNS = [
  /\bhow\b/i,
  /\bwhy\b/i,
  /\bfix\b/i,
  /\bproblem\b/i,
  /\bmistake\b/i,
  /\bguide\b/i,
  /\bchoose\b/i,
  /\bwhich\b/i,
];

function scoreQueryIntent(query: string) {
  let score = 0;
  for (const pattern of HIGH_INTENT_PATTERNS) {
    if (pattern.test(query)) score += 8;
  }
  for (const pattern of MID_INTENT_PATTERNS) {
    if (pattern.test(query)) score += 4;
  }
  return Math.min(24, score);
}

function scoreQueryIntentForCategory(query: string, category: string | null) {
  const base = scoreQueryIntent(query);
  if (!category) return base;

  const normalizedQuery = query.toLowerCase();
  const normalizedCategory = category.toLowerCase();
  const categoryTokens = normalizedCategory.split(/[\/\s-]+/).filter((token) => token.length >= 3);

  let boost = 0;
  if (categoryTokens.some((token) => normalizedQuery.includes(token))) {
    boost += 4;
  }

  if (/electronics|smartwatch|earbuds|headphones|speaker|audio|car|vehicle|apple|tablet|laptop|tool|home-improvement/i.test(normalizedCategory)) {
    if (/\bbest\b|\breview\b|\bvs\b|\bcompare\b|\bunder\b|\bbudget\b/i.test(normalizedQuery)) {
      boost += 4;
    }
  }

  if (/dog|pet/i.test(normalizedCategory)) {
    if (/\bbest\b|\bwhy\b|\bproblem\b|\bguide\b|\bchoose\b/i.test(normalizedQuery)) {
      boost += 3;
    }
  }

  return Math.min(28, base + boost);
}

function normalizeTextForMatch(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s/-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeForMatch(value: string) {
  return normalizeTextForMatch(value)
    .split(/[\s/-]+/)
    .filter((token) => token.length >= 3);
}

function scoreQueryToPageMatch(
  query: string,
  page: { slug: string; title: string; category: string | null },
) {
  const queryTokens = tokenizeForMatch(query);
  if (queryTokens.length === 0) return 0;

  const slugTokens = tokenizeForMatch(page.slug);
  const titleTokens = tokenizeForMatch(page.title);
  const categoryTokens = tokenizeForMatch(page.category ?? "");
  const tokenSet = new Set([...slugTokens, ...titleTokens, ...categoryTokens]);

  let score = 0;
  for (const token of queryTokens) {
    if (tokenSet.has(token)) {
      score += titleTokens.includes(token) ? 3 : slugTokens.includes(token) ? 4 : 2;
    }
  }

  return score;
}

export type OpportunityDetail = OpportunityPageRow & {
  dailyClicks: DailyClicksRow[];
  activeExitLayer: boolean;
  topQueries: Array<{
    key: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  }>;
  selectedSite: string | null;
  activePlacements: Array<{
    id: string;
    slug: string;
    name: string;
    placementType: string;
    weight: number;
    offerName: string;
    offerSlug: string;
    destinationUrl: string;
  }>;
  placementPlan: Array<{
    slot: "MID_ARTICLE" | "BOTTOM_EXIT" | "MOBILE_STICKY";
    priority: "HIGH" | "MEDIUM" | "LOW";
    rationale: string;
  }>;
};

export async function getClickAnalytics(days = 30) {
  const interval = `${Math.max(1, days)} days`;

  const daily = await prisma.$queryRawUnsafe<DailyClicksRow[]>(
    `
    SELECT
      to_char(date_trunc('day', "day"), 'YYYY-MM-DD') AS day,
      COALESCE(SUM(clicks), 0)::int AS clicks
    FROM "ClickAggregate"
    WHERE "day" >= now() - ($1::text)::interval
    GROUP BY 1
    ORDER BY 1 DESC
    `,
    interval
  );

  const topPages = await prisma.$queryRawUnsafe<TopPageRow[]>(
    `
    SELECT
      p.slug,
      p.title,
      COALESCE(SUM(c.clicks), 0)::int AS clicks
    FROM "ClickAggregate" c
    JOIN "Page" p ON p.id = c."pageId"
    WHERE c."day" >= now() - ($1::text)::interval
      AND c."pageId" IS NOT NULL
    GROUP BY p.id
    ORDER BY clicks DESC
    LIMIT 20
    `,
    interval
  );

  const topOffers = await prisma.$queryRawUnsafe<TopOfferRow[]>(
    `
    SELECT
      o.id,
      o.title,
      o.source::text AS source,
      p."canonicalName",
      COALESCE(SUM(c.clicks), 0)::int AS clicks
    FROM "ClickAggregate" c
    JOIN "Offer" o ON o.id = c."offerId"
    JOIN "Product" p ON p.id = o."productId"
    WHERE c."day" >= now() - ($1::text)::interval
      AND c."offerId" IS NOT NULL
    GROUP BY o.id, p.id
    ORDER BY clicks DESC
    LIMIT 20
    `,
    interval
  );

  const totalRows = await prisma.$queryRawUnsafe<Array<{ total: number }>>(
    `
    SELECT COALESCE(SUM(clicks), 0)::int AS total
    FROM "ClickAggregate"
    WHERE "day" >= now() - ($1::text)::interval
    `,
    interval
  );
  const totalClicks = totalRows[0]?.total ?? 0;

  return {
    totalClicks,
    daily,
    topPages,
    topOffers,
  };
}

export async function getTopOpportunityPages(
  days = 30,
  limit = 25,
  preferredSite?: string | null,
  exitFilter: "all" | "inactive" | "active" = "all",
) {
  const interval = `${Math.max(1, days)} days`;
  const safeLimit = Math.max(5, Math.min(100, limit));

  const rows = await prisma.$queryRawUnsafe<
    Array<{
      id: string;
      slug: string;
      title: string;
      type: string;
      publishedAt: Date | null;
      updatedAt: Date;
      category: string | null;
      clicks: number;
      freshness_days: number;
      active_exit_layer: boolean;
    }>
  >(
    `
    SELECT
      p.id,
      p.slug,
      p.title,
      p.type::text AS type,
      p."publishedAt",
      p."updatedAt",
      pr.category,
      COALESCE(SUM(c.clicks), 0)::int AS clicks,
      GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (now() - p."updatedAt")) / 86400))::int AS freshness_days,
      EXISTS (
        SELECT 1
        FROM "TrafficPlacement" tp
        WHERE tp."pageId" = p.id
          AND tp.status = 'active'
      ) AS active_exit_layer
    FROM "Page" p
    LEFT JOIN "ClickAggregate" c
      ON c."pageId" = p.id
      AND c."day" >= now() - ($1::text)::interval
    LEFT JOIN "Product" pr
      ON pr.id = p."productId"
    WHERE p.status = 'PUBLISHED'
      AND p."publishedAt" IS NOT NULL
      AND p.type IN ('ARTICLE', 'REVIEW', 'LANDING')
      AND p.slug NOT LIKE 'insights/%'
      AND p.slug NOT LIKE 'guides/%'
      AND p.slug NOT LIKE 'next/%'
    GROUP BY p.id, pr.category
    ORDER BY clicks DESC, p."publishedAt" DESC, p."updatedAt" DESC
    LIMIT $2
    `,
    interval,
    safeLimit * 3,
  );

  const scoredBase = rows
    .map((row) => {
      const freshnessDays = Number(row.freshness_days || 0);
      const pageTypeScore = row.type === "REVIEW" ? 30 : row.type === "ARTICLE" ? 22 : 18;
      const categoryFitScore =
        row.category && /(electronics|smartwatches|earbuds|apple-products|car-vehicle-electronics|tools-home-improvement|pet-supplies|dog|health-monitor)/i.test(row.category)
          ? 24
          : row.category
            ? 14
            : 8;
      const freshnessScore =
        freshnessDays <= 14 ? 18 :
        freshnessDays <= 45 ? 12 :
        freshnessDays <= 90 ? 8 : 3;
      const clickScore = Math.min(40, Number(row.clicks || 0) * 2);
      const opportunityScore = clickScore + pageTypeScore + categoryFitScore + freshnessScore;
      const recommendation: OpportunityPageRow["recommendation"] =
        opportunityScore >= 70 ? "DOUBLE_DOWN" :
        opportunityScore >= 45 ? "PLACE_EXIT" : "WATCH";

      return {
        id: row.id,
        slug: row.slug,
        title: row.title,
        type: row.type,
        publishedAt: row.publishedAt,
        updatedAt: row.updatedAt,
        category: row.category,
        clicks: Number(row.clicks || 0),
        freshnessDays,
        pageTypeScore,
        categoryFitScore,
        queryIntentScore: 0,
        opportunityScore,
        confidence: "analytics-only" as const,
        recommendation,
        gscClicks: null,
        gscImpressions: null,
        gscCtr: null,
        gscPosition: null,
        activeExitLayer: Boolean(row.active_exit_layer),
      };
    })
    .sort((a, b) => b.opportunityScore - a.opportunityScore || b.clicks - a.clicks)
    .slice(0, safeLimit);

  const gscMetrics = await getSearchConsolePageMetrics(
    scoredBase.map((page) => `https://smartreviewinsights.com/${page.slug}`),
    preferredSite,
    days,
  ).catch(() => null);
  const gscQueryMetrics = await getSearchConsolePageQueryMetrics(
    scoredBase.map((page) => `https://smartreviewinsights.com/${page.slug}`),
    preferredSite,
    days,
  ).catch(() => null);

  const gscByPageUrl = new Map((gscMetrics?.rows ?? []).map((row) => [row.pageUrl, row]));
  const queryIntentByPageUrl = new Map<string, number>();

  for (const row of gscQueryMetrics?.rows ?? []) {
    const current = queryIntentByPageUrl.get(row.pageUrl) ?? 0;
    const page = scoredBase.find((item) => `https://smartreviewinsights.com/${item.slug}` === row.pageUrl);
    const intent = scoreQueryIntentForCategory(row.query, page?.category ?? null);
    const weightedIntent = Math.min(20, intent + Math.min(8, row.clicks * 1.5) + (row.position > 0 && row.position <= 10 ? 3 : 0));
    queryIntentByPageUrl.set(row.pageUrl, Math.max(current, weightedIntent));
  }

  const scored = scoredBase.map((page) => {
    const pageUrl = `https://smartreviewinsights.com/${page.slug}`;
    const gscPage = gscByPageUrl.get(pageUrl);
    const queryIntentScore = queryIntentByPageUrl.get(pageUrl) ?? 0;

    if (!gscPage) {
      return {
        ...page,
        queryIntentScore,
      };
    }

    const gscScore =
      Math.min(24, gscPage.clicks * 1.2) +
      Math.min(12, gscPage.impressions / 25) +
      (gscPage.position > 0 && gscPage.position <= 12 ? 10 : gscPage.position <= 20 ? 6 : 2) +
      queryIntentScore;

    const opportunityScore = Math.round(page.opportunityScore + gscScore);
    const recommendation: OpportunityPageRow["recommendation"] =
      opportunityScore >= 86 ? "DOUBLE_DOWN" :
      opportunityScore >= 58 ? "PLACE_EXIT" : "WATCH";

    const adjustedRecommendation: OpportunityPageRow["recommendation"] =
      page.activeExitLayer && recommendation === "DOUBLE_DOWN" ? "PLACE_EXIT" :
      page.activeExitLayer && recommendation === "PLACE_EXIT" ? "WATCH" :
      recommendation;

    return {
      ...page,
      opportunityScore,
      recommendation: adjustedRecommendation,
      confidence: "hybrid" as const,
      queryIntentScore,
      gscClicks: gscPage.clicks,
      gscImpressions: gscPage.impressions,
      gscCtr: gscPage.ctr,
      gscPosition: gscPage.position,
    };
  });

  return scored
    .filter((page) => {
      if (exitFilter === "inactive") return !page.activeExitLayer;
      if (exitFilter === "active") return page.activeExitLayer;
      return true;
    })
    .sort((a, b) => b.opportunityScore - a.opportunityScore || b.clicks - a.clicks) satisfies OpportunityPageRow[];
}

export async function getTopOpportunityQueries(days = 30, preferredSite?: string | null, limit = 40) {
  const audit = await getSearchConsoleAudit(preferredSite, days);
  if (!audit?.selectedSite) return [] as OpportunityQueryRow[];

  const topQueries = audit.topQueries.slice(0, Math.max(10, Math.min(100, limit)));
  const candidatePages = await prisma.page.findMany({
    where: {
      status: "PUBLISHED",
      publishedAt: { not: null },
      NOT: [
        { slug: { startsWith: "insights/" } },
        { slug: { startsWith: "guides/" } },
        { slug: { startsWith: "next/" } },
      ],
    },
    select: {
      id: true,
      slug: true,
      title: true,
      product: {
        select: {
          category: true,
        },
      },
    },
    take: 500,
  });

  return topQueries.map((row) => {
    const matchedPage = candidatePages
      .map((page) => ({
        page,
        matchScore: scoreQueryToPageMatch(row.key, {
          slug: page.slug,
          title: page.title,
          category: page.product?.category ?? null,
        }),
      }))
      .filter((item) => item.matchScore > 0)
      .sort((a, b) => b.matchScore - a.matchScore)[0]?.page ?? null;
    const intentScore = scoreQueryIntentForCategory(row.key, matchedPage?.product?.category ?? null);
    const recommendation: OpportunityQueryRow["recommendation"] =
      intentScore >= 16 || row.clicks >= 8 ? "DOUBLE_DOWN" :
      intentScore >= 8 || row.impressions >= 40 ? "PLACE_EXIT" : "WATCH";

    return {
      query: row.key,
      pageId: matchedPage?.id ?? null,
      pageSlug: matchedPage?.slug ?? null,
      pageTitle: matchedPage?.title ?? null,
      pageCategory: matchedPage?.product?.category ?? null,
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position,
      intentScore,
      recommendation,
    };
  });
}

export async function getOpportunityDetail(pageId: string, days = 30, preferredSite?: string | null) {
  const ranked = await getTopOpportunityPages(days, 200, preferredSite, "all");
  const base = ranked.find((page) => page.id === pageId);
  if (!base) return null;

  const interval = `${Math.max(1, days)} days`;
  const [activePlacementsRaw, daily, gscInsight] = await Promise.all([
    getActiveTrafficPlacementsForPage(pageId),
    prisma.$queryRawUnsafe<DailyClicksRow[]>(
    `
    SELECT
      to_char(date_trunc('day', "day"), 'YYYY-MM-DD') AS day,
      COALESCE(SUM(clicks), 0)::int AS clicks
    FROM "ClickAggregate"
    WHERE "pageId" = $1
      AND "day" >= now() - ($2::text)::interval
    GROUP BY 1
    ORDER BY 1 DESC
    `,
    pageId,
    interval,
    ),
    getSearchConsolePageInsight(`https://smartreviewinsights.com/${base.slug}`, preferredSite, days).catch(() => null),
  ]);

  const placementPlan: OpportunityDetail["placementPlan"] = [];

  if (base.type === "REVIEW") {
    placementPlan.push(
      {
        slot: "MID_ARTICLE",
        priority: "HIGH",
        rationale: "Review pages already carry decision intent, so the first exit test should sit inside the main reading flow.",
      },
      {
        slot: "BOTTOM_EXIT",
        priority: "HIGH",
        rationale: "Bottom exits catch readers who consumed the full review and are ready for a next click.",
      },
      {
        slot: "MOBILE_STICKY",
        priority: base.recommendation === "DOUBLE_DOWN" ? "MEDIUM" : "LOW",
        rationale: "Use sticky mobile only after the page proves it can absorb stronger click-out pressure.",
      },
    );
  } else if (base.type === "ARTICLE") {
    placementPlan.push(
      {
        slot: "MID_ARTICLE",
        priority: "HIGH",
        rationale: "Problem/guide pages should transition users toward a decision before they bounce.",
      },
      {
        slot: "BOTTOM_EXIT",
        priority: "MEDIUM",
        rationale: "A clean bottom exit gives a second chance without making the page feel too aggressive.",
      },
      {
        slot: "MOBILE_STICKY",
        priority: "LOW",
        rationale: "Only escalate to sticky once the softer placements show stable exit CTR.",
      },
    );
  } else {
    placementPlan.push(
      {
        slot: "BOTTOM_EXIT",
        priority: "HIGH",
        rationale: "Landing pages should keep the path simple and direct, with the main exit concentrated near the close.",
      },
      {
        slot: "MID_ARTICLE",
        priority: "MEDIUM",
        rationale: "If the landing is long enough, add one soft exit in the middle to catch early deciders.",
      },
      {
        slot: "MOBILE_STICKY",
        priority: "LOW",
        rationale: "Use sticky carefully on landing pages to avoid making the experience feel forced too early.",
      },
    );
  }

  return {
    ...base,
    dailyClicks: daily,
    activeExitLayer: activePlacementsRaw.length > 0,
    gscClicks: gscInsight?.page?.clicks ?? base.gscClicks,
    gscImpressions: gscInsight?.page?.impressions ?? base.gscImpressions,
    gscCtr: gscInsight?.page?.ctr ?? base.gscCtr,
    gscPosition: gscInsight?.page?.position ?? base.gscPosition,
    topQueries: gscInsight?.topQueries ?? [],
    selectedSite: gscInsight?.siteUrl ?? null,
    activePlacements: activePlacementsRaw
      .map((placement) => {
        const offer = placement.offers[0]?.offer;
        if (!offer) return null;
        return {
          id: placement.id,
          slug: placement.slug,
          name: placement.name,
          placementType: placement.placementType,
          weight: placement.weight,
          offerName: offer.name,
          offerSlug: offer.slug,
          destinationUrl: offer.destinationUrl,
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item)),
    placementPlan,
  } satisfies OpportunityDetail;
}

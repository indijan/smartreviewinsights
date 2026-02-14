import { prisma } from "@/lib/prisma";

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

export async function getClickAnalytics(days = 30) {
  const interval = `${Math.max(1, days)} days`;

  const daily = await prisma.$queryRawUnsafe<DailyClicksRow[]>(
    `
    SELECT
      to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS day,
      COUNT(*)::int AS clicks
    FROM "ClickEvent"
    WHERE "createdAt" >= now() - ($1::text)::interval
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
      COUNT(*)::int AS clicks
    FROM "ClickEvent" c
    JOIN "Page" p ON p.id = c."pageId"
    WHERE c."createdAt" >= now() - ($1::text)::interval
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
      COUNT(*)::int AS clicks
    FROM "ClickEvent" c
    JOIN "Offer" o ON o.id = c."offerId"
    JOIN "Product" p ON p.id = o."productId"
    WHERE c."createdAt" >= now() - ($1::text)::interval
      AND c."offerId" IS NOT NULL
    GROUP BY o.id, p.id
    ORDER BY clicks DESC
    LIMIT 20
    `,
    interval
  );

  const totalClicks = await prisma.clickEvent.count({
    where: {
      createdAt: {
        gte: new Date(Date.now() - Math.max(1, days) * 24 * 60 * 60 * 1000),
      },
    },
  });

  return {
    totalClicks,
    daily,
    topPages,
    topOffers,
  };
}

import { OfferSource } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type NicheWeight = {
  nicheId: string;
  categoryPath: string;
  weight: number;
};

export async function getWeightedAmazonNiches(days = 30) {
  const interval = `${Math.max(1, Math.min(365, days))} days`;
  const niches = await prisma.automationNiche.findMany({
    where: { source: OfferSource.AMAZON, isEnabled: true },
    orderBy: [{ priority: "asc" }, { updatedAt: "desc" }],
  });
  if (niches.length === 0) return [] as NicheWeight[];

  const rows = await prisma.$queryRawUnsafe<Array<{ category: string; clicks: number }>>(
    `
    SELECT
      pr.category AS category,
      COUNT(*)::int AS clicks
    FROM "ClickEvent" c
    JOIN "Page" p ON p.id = c."pageId"
    JOIN "Product" pr ON pr.id = p."productId"
    WHERE c."createdAt" >= now() - ($1::text)::interval
      AND c."pageId" IS NOT NULL
      AND p.status = 'PUBLISHED'
      AND p.type = 'REVIEW'
    GROUP BY pr.category
    `,
    interval,
  );

  return niches.map((niche) => {
    const clicks = rows.reduce((sum, row) => {
      if (!row?.category) return sum;
      if (row.category === niche.categoryPath || row.category.startsWith(`${niche.categoryPath}/`)) {
        return sum + Number(row.clicks || 0);
      }
      return sum;
    }, 0);

    return {
      nicheId: niche.id,
      categoryPath: niche.categoryPath,
      weight: 1 + clicks,
    };
  });
}

export function pickWeightedUniqueCategoryPaths(
  weighted: Array<{ categoryPath: string; weight: number }>,
  count: number,
) {
  const out: string[] = [];
  const pool = [...weighted];
  const target = Math.max(1, Math.min(pool.length, count));

  while (out.length < target && pool.length > 0) {
    const total = pool.reduce((sum, item) => sum + Math.max(0.0001, item.weight), 0);
    let r = Math.random() * total;
    let picked = 0;
    for (let i = 0; i < pool.length; i += 1) {
      r -= Math.max(0.0001, pool[i].weight);
      if (r <= 0) {
        picked = i;
        break;
      }
    }
    out.push(pool[picked].categoryPath);
    pool.splice(picked, 1);
  }
  return out;
}

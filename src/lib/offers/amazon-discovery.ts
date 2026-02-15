import { ingestOfferItems, type OfferIngestItem } from "@/lib/offers/ingest";
import type { OfferSource } from "@/lib/offer-source";
import { prisma } from "@/lib/prisma";
import { searchAmazonItems } from "@/lib/providers/amazon-paapi";

export type AmazonDiscoveryResult = {
  nichesUsed: number;
  itemsFetched: number;
  ingest: {
    processed: number;
    createdOffers: number;
    updatedOffers: number;
    priceUpdates: number;
  };
};

async function resolvePageSlugForCategory(categoryPath: string) {
  const parts = categoryPath.split("/").filter(Boolean);
  const leaf = parts[parts.length - 1] || categoryPath;

  const page = await prisma.page.findFirst({
    where: {
      status: "PUBLISHED",
      tags: {
        some: {
          tag: {
            name: leaf,
          },
        },
      },
    },
    orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
    select: { slug: true },
  });

  return page?.slug ?? null;
}

export async function discoverAmazonOffers(opts?: { limit?: number; minPriceUsd?: number | null }) {
  const limit = Math.max(1, Math.min(200, opts?.limit ?? 50));

  const niches = await prisma.automationNiche.findMany({
    where: { source: "AMAZON", isEnabled: true },
    orderBy: [{ priority: "asc" }, { updatedAt: "desc" }],
    take: limit,
  });

  if (niches.length === 0) {
    return {
      nichesUsed: 0,
      itemsFetched: 0,
      ingest: { processed: 0, createdOffers: 0, updatedOffers: 0, priceUpdates: 0 },
    } satisfies AmazonDiscoveryResult;
  }

  const seenAsins = new Set<string>();
  const ingestItems: OfferIngestItem[] = [];

  for (const niche of niches) {
    const pageSlug = await resolvePageSlugForCategory(niche.categoryPath);
    const items = await searchAmazonItems({
      keywords: niche.keywords,
      browseNodeId: niche.browseNodeId,
      maxItems: niche.maxItems,
    });

    for (const item of items) {
      if (seenAsins.has(item.asin)) continue;
      seenAsins.add(item.asin);

      const price = item.price;
      if (opts?.minPriceUsd != null && (price == null || price < opts.minPriceUsd)) continue;

      ingestItems.push({
        source: "AMAZON",
        externalId: item.asin,
        title: item.title ?? undefined,
        price,
        currency: item.currency ?? "USD",
        affiliateUrl: item.detailPageUrl || `https://www.amazon.com/dp/${item.asin}`,
        imageUrl: item.imageUrl,
        availability: item.availability,
        productName: item.title || `Amazon Item ${item.asin}`,
        productCategory: niche.categoryPath,
        pageSlug,
        partnerName: "Amazon US",
        payload: {
          nicheId: niche.id,
          nicheCategory: niche.categoryPath,
          nicheKeywords: niche.keywords,
          source: item.raw,
        },
      });
    }
  }

  const ingest = await ingestOfferItems(ingestItems);
  return {
    nichesUsed: niches.length,
    itemsFetched: ingestItems.length,
    ingest,
  } satisfies AmazonDiscoveryResult;
}

import { OfferSource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ingestOfferItems, type OfferIngestItem } from "@/lib/offers/ingest";
import { fetchAmazonItemsByAsins } from "@/lib/providers/amazon-paapi";

export type AmazonSyncResult = {
  candidates: number;
  requestedAsins: number;
  fetchedItems: number;
  ingest: {
    processed: number;
    createdOffers: number;
    updatedOffers: number;
    priceUpdates: number;
  };
};

const ASIN_REGEX = /^[A-Z0-9]{10}$/;

function parseAsinFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const paths = [
      /\/dp\/([A-Z0-9]{10})(?:[/?]|$)/i,
      /\/gp\/product\/([A-Z0-9]{10})(?:[/?]|$)/i,
      /\/product\/([A-Z0-9]{10})(?:[/?]|$)/i,
    ];
    for (const re of paths) {
      const m = parsed.pathname.match(re);
      if (m?.[1]) return m[1].toUpperCase();
    }
    const qp = parsed.searchParams.get("asin") || parsed.searchParams.get("ASIN");
    if (qp && ASIN_REGEX.test(qp.toUpperCase())) return qp.toUpperCase();
  } catch {
    return null;
  }
  return null;
}

function normalizeAsin(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim().toUpperCase();
  return ASIN_REGEX.test(v) ? v : null;
}

export async function syncAmazonOffers(opts?: { limit?: number; onlyOutdatedHours?: number }) {
  const limit = Math.max(1, Math.min(200, opts?.limit ?? 50));
  const outdatedHours = Math.max(0, opts?.onlyOutdatedHours ?? 0);
  const outdatedBefore = outdatedHours > 0 ? new Date(Date.now() - outdatedHours * 60 * 60 * 1000) : null;

  const offers = await prisma.offer.findMany({
    where: {
      source: OfferSource.AMAZON,
      ...(outdatedBefore ? { OR: [{ lastUpdated: null }, { lastUpdated: { lt: outdatedBefore } }] } : {}),
    },
    orderBy: [{ lastUpdated: "asc" }, { updatedAt: "asc" }],
    take: limit,
    include: {
      partner: { select: { name: true } },
      product: {
        select: {
          canonicalName: true,
          category: true,
          pages: { select: { slug: true }, take: 1, orderBy: { publishedAt: "desc" } },
        },
      },
    },
  });

  const byAsin = new Map<
    string,
    {
      externalId: string;
      affiliateUrl: string;
      productName: string;
      productCategory: string;
      pageSlug: string | null;
      partnerName: string | null;
    }
  >();

  for (const offer of offers) {
    const asin = normalizeAsin(offer.externalId) || parseAsinFromUrl(offer.affiliateUrl);
    if (!asin || byAsin.has(asin)) continue;

    byAsin.set(asin, {
      externalId: asin,
      affiliateUrl: offer.affiliateUrl,
      productName: offer.product.canonicalName,
      productCategory: offer.product.category,
      pageSlug: offer.product.pages[0]?.slug ?? null,
      partnerName: offer.partner?.name ?? null,
    });
  }

  const asins = [...byAsin.keys()];
  if (asins.length === 0) {
    return {
      candidates: offers.length,
      requestedAsins: 0,
      fetchedItems: 0,
      ingest: { processed: 0, createdOffers: 0, updatedOffers: 0, priceUpdates: 0 },
    } satisfies AmazonSyncResult;
  }

  const chunks: string[][] = [];
  for (let i = 0; i < asins.length; i += 10) chunks.push(asins.slice(i, i + 10));

  const fetched = [];
  for (const chunk of chunks) {
    const items = await fetchAmazonItemsByAsins(chunk);
    fetched.push(...items);
  }

  const ingestItems: OfferIngestItem[] = fetched.map((item) => {
    const seed = byAsin.get(item.asin);
    if (!seed) {
      throw new Error(`Unexpected ASIN from Amazon response: ${item.asin}`);
    }

    return {
      source: OfferSource.AMAZON,
      externalId: item.asin,
      title: item.title ?? undefined,
      price: item.price,
      currency: item.currency ?? "USD",
      affiliateUrl: item.detailPageUrl || seed.affiliateUrl,
      imageUrl: item.imageUrl,
      availability: item.availability,
      productName: item.title || seed.productName,
      productCategory: seed.productCategory,
      pageSlug: seed.pageSlug,
      partnerName: seed.partnerName,
      payload: item.raw,
    };
  });

  const ingest = await ingestOfferItems(ingestItems);
  return {
    candidates: offers.length,
    requestedAsins: asins.length,
    fetchedItems: fetched.length,
    ingest,
  } satisfies AmazonSyncResult;
}

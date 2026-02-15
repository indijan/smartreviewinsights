import crypto from "node:crypto";
import { ingestOfferItems, type OfferIngestItem } from "@/lib/offers/ingest";
import type { OfferSource } from "@/lib/offer-source";
import { prisma } from "@/lib/prisma";

export type AmazonLinkModeResult = {
  nichesUsed: number;
  linksGenerated: number;
  ingest: {
    processed: number;
    createdOffers: number;
    updatedOffers: number;
    priceUpdates: number;
  };
};

function normalizeKeyword(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function buildAmazonSearchAffiliateUrl(keyword: string, partnerTag: string, marketplace = "www.amazon.com") {
  const q = encodeURIComponent(keyword);
  return `https://${marketplace}/s?k=${q}&tag=${encodeURIComponent(partnerTag)}`;
}

async function resolvePageSlugForCategory(categoryPath: string) {
  const parts = categoryPath.split("/").filter(Boolean);
  const leaf = parts[parts.length - 1] || categoryPath;

  const page = await prisma.page.findFirst({
    where: {
      status: "PUBLISHED",
      tags: {
        some: {
          tag: { name: leaf },
        },
      },
    },
    orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
    select: { slug: true },
  });

  return page?.slug ?? null;
}

function externalIdForLink(categoryPath: string, keyword: string) {
  const base = `${categoryPath}::${keyword}`;
  const digest = crypto.createHash("sha1").update(base).digest("hex").slice(0, 16);
  return `AMZ_LINK_${digest}`;
}

export async function generateAmazonAffiliateLinks(opts?: { limit?: number }) {
  const limit = Math.max(1, Math.min(200, opts?.limit ?? 50));

  const partnerTag = process.env.AMAZON_CREATOR_PARTNER_TAG || process.env.AMAZON_PAAPI_PARTNER_TAG;
  if (!partnerTag) throw new Error("AMAZON_CREATOR_PARTNER_TAG is required for link mode");

  const marketplace = process.env.AMAZON_CREATOR_MARKETPLACE || process.env.AMAZON_PAAPI_MARKETPLACE || "www.amazon.com";

  const niches = await prisma.automationNiche.findMany({
    where: { source: "AMAZON", isEnabled: true },
    orderBy: [{ priority: "asc" }, { updatedAt: "desc" }],
    take: limit,
  });

  if (niches.length === 0) {
    return {
      nichesUsed: 0,
      linksGenerated: 0,
      ingest: { processed: 0, createdOffers: 0, updatedOffers: 0, priceUpdates: 0 },
    } satisfies AmazonLinkModeResult;
  }

  const items: OfferIngestItem[] = [];
  for (const niche of niches) {
    const keyword = normalizeKeyword(niche.keywords || niche.categoryPath.split("/").pop() || niche.categoryPath);
    if (!keyword) continue;

    const pageSlug = await resolvePageSlugForCategory(niche.categoryPath);

    items.push({
      source: "AMAZON",
      externalId: externalIdForLink(niche.categoryPath, keyword),
      title: `${keyword} on Amazon`,
      price: null,
      currency: "USD",
      affiliateUrl: buildAmazonSearchAffiliateUrl(keyword, partnerTag, marketplace),
      imageUrl: null,
      availability: null,
      productName: keyword,
      productCategory: niche.categoryPath,
      pageSlug,
      partnerName: "Amazon US",
      payload: {
        mode: "affiliate-link-only",
        categoryPath: niche.categoryPath,
        keyword,
      },
    });
  }

  const ingest = await ingestOfferItems(items);
  return {
    nichesUsed: niches.length,
    linksGenerated: items.length,
    ingest,
  } satisfies AmazonLinkModeResult;
}

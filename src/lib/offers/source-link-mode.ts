import crypto from "node:crypto";
import { OfferSource, PageStatus } from "@prisma/client";
import { ingestOfferItems, type OfferIngestItem } from "@/lib/offers/ingest";
import { prisma } from "@/lib/prisma";

export type SourceLinkModeResult = {
  source: OfferSource;
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

function sourceSearchUrl(source: OfferSource, keyword: string, partnerTag?: string | null, marketplace = "www.amazon.com") {
  const q = encodeURIComponent(keyword);
  switch (source) {
    case "AMAZON":
      return `https://${marketplace}/s?k=${q}${partnerTag ? `&tag=${encodeURIComponent(partnerTag)}` : ""}`;
    case "ALIEXPRESS":
      return `https://www.aliexpress.com/wholesale?SearchText=${q}`;
    case "TEMU":
      return `https://www.temu.com/search_result.html?search_key=${q}`;
    case "ALIBABA":
      return `https://www.alibaba.com/trade/search?SearchText=${q}`;
    case "EBAY":
      return `https://www.ebay.com/sch/i.html?_nkw=${q}`;
    default:
      return `https://www.google.com/search?q=${q}`;
  }
}

function externalIdForLink(source: OfferSource, categoryPath: string, keyword: string) {
  const base = `${source}:${categoryPath}:${keyword}`;
  const digest = crypto.createHash("sha1").update(base).digest("hex").slice(0, 16);
  return `${source}_LINK_${digest}`;
}

async function resolvePageSlugForCategory(categoryPath: string) {
  const parts = categoryPath.split("/").filter(Boolean);
  const leaf = parts[parts.length - 1] || categoryPath;

  const page = await prisma.page.findFirst({
    where: {
      status: PageStatus.PUBLISHED,
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

function applyDeepLinkPattern(
  pattern: string | null | undefined,
  targetUrl: string,
  keyword: string,
  trackingId?: string | null,
) {
  if (!pattern) return targetUrl;
  return pattern
    .replaceAll("{url}", encodeURIComponent(targetUrl))
    .replaceAll("{query}", encodeURIComponent(keyword))
    .replaceAll("{trackingId}", encodeURIComponent(trackingId || ""))
    .replaceAll("{tag}", encodeURIComponent(trackingId || ""));
}

export async function generateAffiliateLinksForSource(opts: { source: OfferSource; limit?: number }) {
  const limit = Math.max(1, Math.min(200, opts.limit ?? 50));

  const [niches, partner, account] = await Promise.all([
    prisma.automationNiche.findMany({
      where: { source: opts.source, isEnabled: true },
      orderBy: [{ priority: "asc" }, { updatedAt: "desc" }],
      take: limit,
    }),
    prisma.partner.findFirst({ where: { source: opts.source, isEnabled: true }, orderBy: { createdAt: "asc" }, select: { name: true } }),
    prisma.affiliateAccount.findFirst({
      where: { isActive: true, partner: { source: opts.source, isEnabled: true } },
      orderBy: { updatedAt: "desc" },
      select: { deepLinkPattern: true, trackingId: true },
    }),
  ]);

  if (niches.length === 0) {
    return {
      source: opts.source,
      nichesUsed: 0,
      linksGenerated: 0,
      ingest: { processed: 0, createdOffers: 0, updatedOffers: 0, priceUpdates: 0 },
    } satisfies SourceLinkModeResult;
  }

  const marketplace = process.env.AMAZON_CREATOR_MARKETPLACE || process.env.AMAZON_PAAPI_MARKETPLACE || "www.amazon.com";
  const amazonTag = process.env.AMAZON_CREATOR_PARTNER_TAG || process.env.AMAZON_PAAPI_PARTNER_TAG || account?.trackingId || null;

  const items: OfferIngestItem[] = [];
  for (const niche of niches) {
    const keyword = normalizeKeyword(niche.keywords || niche.categoryPath.split("/").pop() || niche.categoryPath);
    if (!keyword) continue;

    const pageSlug = await resolvePageSlugForCategory(niche.categoryPath);
    const rawUrl = sourceSearchUrl(opts.source, keyword, amazonTag, marketplace);
    const affiliateUrl = applyDeepLinkPattern(account?.deepLinkPattern, rawUrl, keyword, account?.trackingId);

    items.push({
      source: opts.source,
      externalId: externalIdForLink(opts.source, niche.categoryPath, keyword),
      title: `${keyword} ${opts.source} search`,
      price: null,
      currency: "USD",
      affiliateUrl,
      imageUrl: null,
      availability: null,
      productName: keyword,
      productCategory: niche.categoryPath,
      pageSlug,
      partnerName: partner?.name || null,
      payload: {
        mode: "source-link-mode",
        source: opts.source,
        categoryPath: niche.categoryPath,
        keyword,
        url: rawUrl,
      },
    });
  }

  const ingest = await ingestOfferItems(items);
  return {
    source: opts.source,
    nichesUsed: niches.length,
    linksGenerated: items.length,
    ingest,
  } satisfies SourceLinkModeResult;
}

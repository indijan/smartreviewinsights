import crypto from "node:crypto";
import { ingestOfferItems, type OfferIngestItem } from "@/lib/offers/ingest";
import type { OfferSource } from "@/lib/offer-source";
import { prisma } from "@/lib/prisma";

export type CseItem = {
  title: string;
  link: string;
  snippet?: string;
  imageUrl?: string;
};

export type CseLinkDiscoveryResult = {
  source: OfferSource;
  nichesUsed: number;
  linksFound: number;
  ingest: {
    processed: number;
    createdOffers: number;
    updatedOffers: number;
    priceUpdates: number;
  };
};

export const SOURCE_DOMAINS: Record<OfferSource, string[]> = {
  AMAZON: ["amazon.com"],
  ALIEXPRESS: ["aliexpress.com"],
  TEMU: ["temu.com"],
  ALIBABA: ["alibaba.com"],
  EBAY: ["ebay.com"],
};

type CseConfig = {
  apiKeys: string[];
  cx: string;
};

export function getGoogleCseConfig(): CseConfig | null {
  const apiKeys = [
    process.env.GOOGLE_CSE_API_KEY || process.env.GOOGLE_API_KEY || "",
    process.env.GOOGLE_CSE_API_KEY_2 || "",
  ]
    .map((k) => k.trim())
    .filter(Boolean);
  const cx = process.env.GOOGLE_CSE_CX || process.env.GOOGLE_CX;
  if (apiKeys.length === 0 || !cx) return null;
  return { apiKeys, cx };
}

function normalizeKeyword(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function hashExternalId(source: OfferSource, link: string) {
  const digest = crypto.createHash("sha1").update(`${source}:${link}`).digest("hex").slice(0, 18);
  return `${source}_LINK_${digest}`;
}

function applyDeepLinkPattern(
  pattern: string | null | undefined,
  productUrl: string,
  keyword: string,
  trackingId?: string | null,
) {
  if (!pattern) return productUrl;
  return pattern
    .replaceAll("{url}", encodeURIComponent(productUrl))
    .replaceAll("{query}", encodeURIComponent(keyword))
    .replaceAll("{trackingId}", encodeURIComponent(trackingId || ""))
    .replaceAll("{tag}", encodeURIComponent(trackingId || ""));
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

async function googleCseSearch(keyword: string, domains: string[], num: number, start = 1): Promise<CseItem[]> {
  const config = getGoogleCseConfig();
  if (!config) {
    throw new Error(
      "Google CSE is not configured. Set GOOGLE_CSE_API_KEY(+ optional GOOGLE_CSE_API_KEY_2)+GOOGLE_CSE_CX or GOOGLE_API_KEY+GOOGLE_CX",
    );
  }

  const capped = Math.max(1, Math.min(10, num));
  const startAt = Math.max(1, Math.min(91, start));
  const siteFilter = domains.map((d) => `site:${d}`).join(" OR ");
  const q = `${siteFilter} ${keyword}`;

  const parseItems = (json: Record<string, unknown>) => {
    const items = (Array.isArray(json.items) ? json.items : []) as Array<Record<string, unknown>>;
    return items
      .map((it) => {
        const pagemap = typeof it.pagemap === "object" && it.pagemap !== null ? (it.pagemap as Record<string, unknown>) : null;
        const cseImages = pagemap && Array.isArray(pagemap.cse_image) ? (pagemap.cse_image as Array<Record<string, unknown>>) : [];
        const imageUrlRaw = cseImages[0]?.src;
        return {
          title: String(it.title || "").trim(),
          link: String(it.link || "").trim(),
          snippet: it.snippet ? String(it.snippet) : undefined,
          imageUrl: typeof imageUrlRaw === "string" ? imageUrlRaw : undefined,
        };
      })
      .filter((it) => it.link);
  };

  const isQuotaError = (status: number, json: Record<string, unknown>) => {
    const rawMessage =
      typeof json.error === "object" &&
      json.error !== null &&
      typeof (json.error as { message?: unknown }).message === "string"
        ? (json.error as { message: string }).message
        : "";
    const msg = rawMessage.toLowerCase();
    return status === 429 || msg.includes("quota exceeded") || msg.includes("resource_exhausted") || msg.includes("ratelimitexceeded");
  };

  let lastQuotaError: string | null = null;
  for (let i = 0; i < config.apiKeys.length; i += 1) {
    const apiKey = config.apiKeys[i];
    const url = new URL("https://customsearch.googleapis.com/customsearch/v1");
    url.searchParams.set("key", apiKey);
    url.searchParams.set("cx", config.cx);
    url.searchParams.set("q", q);
    url.searchParams.set("num", String(capped));
    url.searchParams.set("start", String(startAt));

    const response = await fetch(url.toString(), { cache: "no-store" });
    const json = (await response.json()) as Record<string, unknown>;
    if (response.ok) {
      return parseItems(json);
    }

    const rawMessage =
      typeof json.error === "object" &&
      json.error !== null &&
      typeof (json.error as { message?: unknown }).message === "string"
        ? (json.error as { message: string }).message
        : "";
    if (response.status === 403 && rawMessage.toLowerCase().includes("custom search json api")) {
      throw new Error("Google CSE 403: Custom Search JSON API nincs engedelyezve az API kulcs GCP projektjeben.");
    }

    if (isQuotaError(response.status, json) && i < config.apiKeys.length - 1) {
      lastQuotaError = `Google CSE key#${i + 1} quota hit: ${rawMessage || response.status}`;
      continue;
    }

    if (isQuotaError(response.status, json) && i === config.apiKeys.length - 1) {
      const prefix = lastQuotaError ? `${lastQuotaError}; ` : "";
      throw new Error(`${prefix}Google CSE quota exhausted on all configured keys: ${JSON.stringify(json).slice(0, 500)}`);
    }

    throw new Error(`Google CSE error ${response.status}: ${JSON.stringify(json).slice(0, 500)}`);
  }

  throw new Error("Google CSE failed: no API key succeeded.");
}

export async function searchGoogleCseBySource(
  source: OfferSource,
  keyword: string,
  num: number,
  opts?: { start?: number },
): Promise<CseItem[]> {
  const domains = SOURCE_DOMAINS[source] ?? [];
  if (domains.length === 0) return [];
  return googleCseSearch(keyword, domains, num, opts?.start ?? 1);
}

export async function discoverLinksForSourceWithCse(source: OfferSource, opts?: { limit?: number }) {
  const limit = Math.max(1, Math.min(200, opts?.limit ?? 50));

  const domains = SOURCE_DOMAINS[source] ?? [];
  if (domains.length === 0) {
    throw new Error(`No domain mapping for source ${source}`);
  }

  const [niches, partner, account] = await Promise.all([
    prisma.automationNiche.findMany({
      where: { source, isEnabled: true },
      orderBy: [{ priority: "asc" }, { updatedAt: "desc" }],
    }),
    prisma.partner.findFirst({ where: { source, isEnabled: true }, orderBy: { createdAt: "asc" }, select: { name: true } }),
    prisma.affiliateAccount.findFirst({
      where: { isActive: true, partner: { source, isEnabled: true } },
      orderBy: { updatedAt: "desc" },
      select: { deepLinkPattern: true, trackingId: true },
    }),
  ]);

  if (niches.length === 0) {
    return {
      source,
      nichesUsed: 0,
      linksFound: 0,
      ingest: { processed: 0, createdOffers: 0, updatedOffers: 0, priceUpdates: 0 },
    } satisfies CseLinkDiscoveryResult;
  }

  const seenLinks = new Set<string>();
  const ingestItems: OfferIngestItem[] = [];
  let nichesUsed = 0;

  for (const niche of niches) {
    if (ingestItems.length >= limit) break;

    const keyword = normalizeKeyword(niche.keywords || niche.categoryPath.split("/").pop() || niche.categoryPath);
    if (!keyword) continue;
    nichesUsed += 1;

    const remaining = Math.max(0, limit - ingestItems.length);
    const results = await googleCseSearch(keyword, domains, Math.min(niche.maxItems, remaining));
    const pageSlug = await resolvePageSlugForCategory(niche.categoryPath);

    for (const item of results) {
      if (ingestItems.length >= limit) break;
      if (seenLinks.has(item.link)) continue;
      seenLinks.add(item.link);

      const affiliateUrl = applyDeepLinkPattern(account?.deepLinkPattern, item.link, keyword, account?.trackingId);

      ingestItems.push({
        source,
        externalId: hashExternalId(source, item.link),
        title: item.title || `${keyword} (${source})`,
        price: null,
        currency: "USD",
        affiliateUrl,
        imageUrl: null,
        availability: null,
        productName: item.title || keyword,
        productCategory: niche.categoryPath,
        pageSlug,
        partnerName: partner?.name || null,
        payload: {
          mode: "cse-link-discovery",
          source,
          nicheCategory: niche.categoryPath,
          keyword,
          domains,
          cse: item,
        },
      });
    }
  }

  const ingest = await ingestOfferItems(ingestItems);
  return {
    source,
    nichesUsed,
    linksFound: ingestItems.length,
    ingest,
  } satisfies CseLinkDiscoveryResult;
}

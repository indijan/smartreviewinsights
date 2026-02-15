import crypto from "node:crypto";
import { categoryLabel } from "@/lib/category-taxonomy";
import type { OfferSource } from "@/lib/offer-source";
import { validateAffiliateUrl } from "@/lib/offers/affiliate-validation";
import { ingestOfferItems, type OfferIngestItem } from "@/lib/offers/ingest";
import { prisma } from "@/lib/prisma";

type PipelineResult = {
  nichesUsed: number;
  requestedPosts: number;
  createdPages: number;
  updatedPages: number;
  generatedOffers: number;
  createdOffers: number;
  updatedOffers: number;
  skippedNoValidAmazon: number;
  cseCalls: number;
  cseCacheHitsFresh: number;
  cseCacheHitsStaleFallback: number;
  cseQuotaErrors: number;
};

type AmazonSelected = {
  asin: string;
  url: string;
  title: string;
  snippet: string;
  imageUrl?: string;
};

type PartnerCandidate = {
  source: OfferSource;
  title: string;
  url: string;
  snippet: string;
  parsedPrice: { price: number; currency: "USD" } | null;
};
type CseItem = {
  title: string;
  link: string;
  snippet?: string;
  imageUrl?: string;
};

type ScrapedListingData = {
  finalUrl: string;
  title: string;
  description: string;
  images: string[];
  bullets: string[];
};

const CSE_CACHE_TTL_DAYS = 14;
const MAX_TOTAL_OFFERS_PER_PAGE = 1;

type CseCachePayload = {
  source: OfferSource;
  query: string;
  num: number;
  start?: number;
  fetchedAt: string;
  items: CseItem[];
};

type CseFetchMeta = {
  fromCache: "NONE" | "FRESH" | "STALE";
  quotaError: boolean;
  usedFallback: boolean;
  errorMessage: string | null;
};

type AutomationConfigLike = {
  source: OfferSource;
  publishMode?: string | null;
  aiRewriteEnabled?: boolean | null;
  promptTemplate?: string | null;
};

function stableHash(value: string) {
  return crypto.createHash("sha1").update(value).digest("hex");
}

function toSlug(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function cleanProductTitle(raw: string) {
  const title = String(raw || "")
    .replace(/^amazon\.[a-z.]+\s*:\s*/i, "")
    .replace(/\s+-\s*amazon\.[a-z.]+$/i, "")
    .replace(/\s*\.\.\.\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return title || "Amazon Product";
}

function cleanSnapshotText(raw: string) {
  return String(raw || "")
    .replace(/^amazon\.[a-z.]+\s*:\s*/i, "")
    .replace(/\s*:\s*electronics\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCompareText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function isGenericTitle(title: string) {
  const t = title.trim().toLowerCase();
  return !t || t === "amazon product" || /^amazon product\b/.test(t);
}

function stripHtmlTags(input: string) {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function htmlEntityDecode(input: string) {
  return input
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&nbsp;", " ");
}

function extractMetaContent(html: string, key: string) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regexes = [
    new RegExp(`<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${escaped}["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+name=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${escaped}["'][^>]*>`, "i"),
  ];
  for (const r of regexes) {
    const m = html.match(r);
    if (m?.[1]) return htmlEntityDecode(m[1]).trim();
  }
  return "";
}

function extractTitleTag(html: string) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m?.[1] ? htmlEntityDecode(stripHtmlTags(m[1])) : "";
}

function normalizeAbsoluteUrl(url: string) {
  try {
    const u = new URL(url);
    if (!/^https?:$/i.test(u.protocol)) return "";
    return u.toString();
  } catch {
    return "";
  }
}

function toHighResAmazonImage(url: string) {
  let out = url;
  out = out.replace(/\._[^/]+_\./g, ".");
  out = out.replace(/(\.jpg|\.jpeg|\.png)\?.*$/i, "$1");
  return out;
}

function isLikelyHighQualityProductImage(url: string) {
  const lowered = url.toLowerCase();
  if (!/(m\.media-amazon\.com|images-na\.ssl-images-amazon\.com|\/images\/i\/)/.test(lowered)) return false;
  if (/(sprite|icon|logo|spinner|loading|play-button|transparent|avatar|badge|thumbnail|thumb)/.test(lowered)) return false;
  if (/_sx[0-9]{1,3}_|_sy[0-9]{1,3}_|_ss[0-9]{1,3}_|_ac_us[0-9]{1,3}_/i.test(url)) return false;
  return true;
}

function buildProsFromHighlights(highlights: string[]) {
  const rewrite = (line: string) => {
    const cleaned = line.replace(/\s+/g, " ").trim();
    const short = cleaned.split(/[;,.]/)[0]?.trim() || cleaned;
    const compact = short.length > 90 ? `${short.slice(0, 87).trim()}...` : short;
    return `Useful in practice: ${compact.charAt(0).toLowerCase()}${compact.slice(1)}`;
  };
  return highlights
    .slice(0, 5)
    .map(rewrite)
    .filter(Boolean);
}

function isSimpleAccessory(productTitle: string, bullets: string[]) {
  const hay = `${productTitle} ${bullets.join(" ")}`.toLowerCase();
  return /(cable|charger|adapter|airtag|tag|strap|case|protector|mount|dongle|hub|remote)/.test(hay);
}

function extractJsonLdBlocks(html: string): Record<string, unknown>[] {
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const out: Record<string, unknown>[] = [];
  for (const b of blocks) {
    const raw = b[1]?.trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && typeof item === "object") out.push(item as Record<string, unknown>);
        }
      } else if (parsed && typeof parsed === "object") {
        out.push(parsed as Record<string, unknown>);
      }
    } catch {
      continue;
    }
  }
  return out;
}

function extractLikelyProductBullets(html: string) {
  const bullets: string[] = [];
  const blockMatch = html.match(/<div[^>]+id=["']feature-bullets["'][^>]*>([\s\S]*?)<\/div>/i);
  const source = blockMatch?.[1] || html;
  const liMatches = [...source.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)];
  for (const li of liMatches) {
    const text = htmlEntityDecode(stripHtmlTags(li[1] || ""))
      .replace(/\$\s*[0-9]+(?:[.,][0-9]{2})?/g, "")
      .trim();
    if (!text || text.length < 15) continue;
    if (/^customer reviews?$/i.test(text)) continue;
    bullets.push(text);
    if (bullets.length >= 8) break;
  }
  return bullets;
}

async function scrapeSelectedListingData(amazonUrl: string, runId?: string): Promise<ScrapedListingData | null> {
  const cacheKey = `scrape-listing:v1:${stableHash(amazonUrl)}`;
  const cached = await getCache<ScrapedListingData>(cacheKey);
  if (cached) {
    await logStep(runId, "SCRAPE_LISTING_CACHE_HIT", "OK", { url: amazonUrl }, { title: cached.title, images: cached.images.length });
    return cached;
  }

  try {
    const response = await fetch(amazonUrl, {
      method: "GET",
      cache: "no-store",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!response.ok) {
      await logStep(runId, "SCRAPE_LISTING", "WARN", { url: amazonUrl }, { status: response.status }, "listing-fetch-not-ok");
      return null;
    }
    const html = await response.text();
    const title =
      cleanProductTitle(extractMetaContent(html, "og:title")) ||
      cleanProductTitle(extractTitleTag(html)) ||
      "Amazon Product";
    let description =
      extractMetaContent(html, "description") ||
      extractMetaContent(html, "og:description") ||
      "";

    const images = new Set<string>();
    // Do not collect generic <img> tags because ad/sprite assets frequently pollute results.

    const jsonLd = extractJsonLdBlocks(html);
    let hasProductJsonLdImage = false;
    for (const block of jsonLd) {
      const typeValue = String(block["@type"] || "").toLowerCase();
      if (!typeValue.includes("product")) continue;
      const jsonDesc = typeof block.description === "string" ? block.description : "";
      if (!description && jsonDesc) {
        const clean = htmlEntityDecode(stripHtmlTags(jsonDesc)).replace(/\s+/g, " ").trim();
        if (clean) description = clean;
      }
      const rawImage = block.image;
      if (typeof rawImage === "string") {
        const abs = toHighResAmazonImage(normalizeAbsoluteUrl(rawImage));
        if (abs && isLikelyHighQualityProductImage(abs)) {
          images.add(abs);
          hasProductJsonLdImage = true;
        }
      } else if (Array.isArray(rawImage)) {
        for (const item of rawImage) {
          if (typeof item !== "string") continue;
          const abs = toHighResAmazonImage(normalizeAbsoluteUrl(item));
          if (abs && isLikelyHighQualityProductImage(abs)) {
            images.add(abs);
            hasProductJsonLdImage = true;
          }
          if (images.size >= 6) break;
        }
      }
    }
    if (!hasProductJsonLdImage) {
      const ogImage = toHighResAmazonImage(normalizeAbsoluteUrl(extractMetaContent(html, "og:image")));
      if (ogImage && isLikelyHighQualityProductImage(ogImage)) images.add(ogImage);
    }

    const bullets = extractLikelyProductBullets(html);
    const payload: ScrapedListingData = {
      finalUrl: response.url || amazonUrl,
      title,
      description: cleanSnapshotText(htmlEntityDecode(stripHtmlTags(description)).replace(/\s+/g, " ").trim()),
      images: Array.from(images).slice(0, 6),
      bullets,
    };
    await setCache(cacheKey, payload, 14);
    await logStep(runId, "SCRAPE_LISTING", "OK", { url: amazonUrl }, { title: payload.title, images: payload.images.length, bullets: payload.bullets.length });
    return payload;
  } catch (error) {
    await logStep(
      runId,
      "SCRAPE_LISTING",
      "WARN",
      { url: amazonUrl },
      { ok: false },
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }
}


function parseASIN(url: string): string | null {
  const regexList = [
    /^https?:\/\/(?:[a-z0-9-]+\.)*amazon\.[a-z.]+\/(?:[^/?#]+\/)?dp\/([A-Z0-9]{10})(?:[/?#]|$)/i,
    /^https?:\/\/(?:[a-z0-9-]+\.)*amazon\.[a-z.]+\/gp\/product\/([A-Z0-9]{10})(?:[/?#]|$)/i,
  ];
  for (const r of regexList) {
    const m = url.match(r);
    if (m?.[1]) return m[1].toUpperCase();
  }
  const generic = url.match(/\b([A-Z0-9]{10})\b/i);
  return generic?.[1]?.toUpperCase() ?? null;
}

function isValidAmazonProductUrl(url: string): boolean {
  return parseASIN(url) !== null;
}

function buildAmazonSearchQuery(category: string) {
  const raw = String(category || "").trim();
  if (/^https?:\/\//i.test(raw)) {
    try {
      const u = new URL(raw);
      const extracted =
        u.searchParams.get("k") ||
        u.searchParams.get("keywords") ||
        u.searchParams.get("field-keywords") ||
        "";
      const keyword = String(extracted || "").replace(/\+/g, " ").trim();
      return keyword || raw;
    } catch {
      return raw;
    }
  }
  return raw;
}

function parsePriceFromSnippet(snippet: string): { price: number; currency: "USD" } | null {
  if (!snippet) return null;
  const usd = snippet.match(/\$\s*([0-9]{1,5}(?:[.,][0-9]{2})?)/);
  if (!usd) return null;
  const value = Number(usd[1].replace(",", "."));
  if (!Number.isFinite(value)) return null;
  return { price: value, currency: "USD" };
}

function nonEmptyLines(values: unknown, fallback: string[]): string[] {
  const items = Array.isArray(values) ? values.map((x) => String(x || "").trim()).filter(Boolean) : [];
  return items.length > 0 ? items.slice(0, fallback.length) : fallback;
}

function buildFallbackReview(args: {
  productTitle: string;
  category: string;
  bullets: string[];
  partnerOffersCount: number;
}) {
  const title = cleanProductTitle(args.productTitle);
  const bulletLines = args.bullets.filter(Boolean).slice(0, 8);
  const simpleAccessory = isSimpleAccessory(title, bulletLines);
  const pros = bulletLines.slice(0, 5);
  const categoryLower = args.category.toLowerCase();
  const hasBattery = bulletLines.some((x) => /battery|mah|charge|charging|recharge/i.test(x));
  const hasWater = bulletLines.some((x) => /water|swim|ip67|ip68|waterproof/i.test(x));
  const hasAlexaOrApp = bulletLines.some((x) => /alexa|app|bluetooth|wifi|ios|android/i.test(x));

  const cons = simpleAccessory
    ? [
        "Build quality and durability can differ noticeably between similar-looking options.",
        "Length/connector fit should be checked against your exact device setup.",
      ]
    : [
    hasBattery
      ? "Battery runtime can vary a lot based on active features and notification load."
      : "Battery/runtime behavior is not always predictable from listing text alone.",
    hasAlexaOrApp
      ? "App setup and connectivity stability depend on phone compatibility and environment."
      : "Setup experience can vary depending on your existing devices and ecosystem.",
    hasWater
      ? "Water resistance claims should still be checked against your real usage (pool, sea, shower)."
      : "Some practical limits only become clear after real-world daily use.",
  ];

  const bestFor = simpleAccessory
    ? [
        "Users who need a practical replacement or spare for everyday use.",
        "Buyers comparing price/value across similar options.",
      ]
    : [
    categoryLower.includes("smartwatch")
      ? "Users who want everyday smartwatch features like notifications and activity tracking."
      : `Users looking for a practical ${args.category} product in daily use.`,
    hasAlexaOrApp
      ? "People already comfortable with companion apps and connected features."
      : "Buyers who prefer straightforward feature sets over niche extras.",
    args.partnerOffersCount > 1
      ? "Shoppers who want to compare multiple sellers before checkout."
      : "Buyers who want a single direct purchase path.",
  ];

  const notFor = simpleAccessory
    ? []
    : [
    categoryLower.includes("smartwatch")
      ? "Athletes who need advanced multi-sport or triathlon-grade training analytics."
      : "Power users who require highly specialized pro-level feature depth.",
    hasAlexaOrApp
      ? "Users who want a fully offline experience with no app/account dependency."
      : "Buyers expecting premium features without validating full specs first.",
  ];

  const keyFeatures = bulletLines.slice(0, 5).length
    ? bulletLines.slice(0, 5)
    : [title, `${args.category} fit`, "Direct product-page targeting", "Seller offer comparison", "Affiliate checkout links"];
  return {
    tldr: `${title} is selected as a relevant ${args.category} option. Use the offer box to compare seller pricing before buying.`,
    pros: pros.length ? pros : ["Relevant product match for the selected category", "Includes direct purchase options from multiple sellers"],
    cons,
    bestFor,
    notFor,
    keyFeatures,
    disclaimer: "This page may include affiliate links.",
    partnerOffersCount: args.partnerOffersCount,
  };
}

async function getCache<T>(key: string): Promise<T | null> {
  const row = await prisma.automationCache.findUnique({ where: { key } });
  if (!row) return null;
  if (row.expiresAt <= new Date()) return null;
  return row.value as T;
}

async function getCacheIncludingExpired<T>(key: string): Promise<{ value: T; expired: boolean; expiresAt: Date } | null> {
  const row = await prisma.automationCache.findUnique({ where: { key } });
  if (!row) return null;
  return {
    value: row.value as T,
    expired: row.expiresAt <= new Date(),
    expiresAt: row.expiresAt,
  };
}

async function setCache(key: string, value: unknown, ttlDays: number) {
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
  await prisma.automationCache.upsert({
    where: { key },
    update: { value: value as never, expiresAt },
    create: { key, value: value as never, expiresAt },
  });
}

async function logStep(runId: string | null | undefined, step: string, status: "OK" | "WARN" | "ERROR", input: unknown, output: unknown, message?: string) {
  await prisma.automationStepLog.create({
    data: {
      runId: runId ?? null,
      step,
      status,
      input: (input ?? null) as never,
      output: (output ?? null) as never,
      message: message || null,
    },
  });
}

function makeCseCacheKey(query: string, num: number, start = 1) {
  return `amz-search:v1:${num}:${start}:${stableHash(query.trim().toLowerCase())}`;
}

function buildAmazonSearchPageUrl(query: string, page: number) {
  if (/^https?:\/\//i.test(query)) {
    const u = new URL(query);
    if (!u.hostname.includes("amazon.")) {
      return `https://www.amazon.com/s?k=${encodeURIComponent(query)}&page=${page}`;
    }
    u.searchParams.set("page", String(page));
    return u.toString();
  }
  return `https://www.amazon.com/s?k=${encodeURIComponent(query)}&page=${page}`;
}

function stripAmazonRedirectUrl(href: string) {
  if (!href) return "";
  try {
    const u = new URL(href, "https://www.amazon.com");
    if (u.pathname === "/gp/slredirect" || u.pathname === "/s") return "";
    return u.toString();
  } catch {
    return "";
  }
}

function parseAmazonSearchResultsFromHtml(html: string): CseItem[] {
  const items: CseItem[] = [];
  const blocks = html.split(/<div[^>]+data-component-type=["']s-search-result["'][^>]*>/i).slice(1);
  for (const blockRaw of blocks) {
    const block = blockRaw.slice(0, 8000);
    const linkMatch = block.match(/<a[^>]+href=["']([^"']*\/(?:dp|gp\/product)\/[A-Z0-9]{10}[^"']*)["'][^>]*>/i);
    const rawHref = linkMatch?.[1] || "";
    const link = stripAmazonRedirectUrl(rawHref);
    if (!link) continue;
    const asin = parseASIN(link);
    if (!asin) continue;
    const titleMatch = block.match(/<h2[^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>[\s\S]*?<\/h2>/i);
    const title = cleanProductTitle(htmlEntityDecode(stripHtmlTags(titleMatch?.[1] || "")));
    const snippetMatch =
      block.match(/<div[^>]+class=["'][^"']*a-color-secondary[^"']*["'][^>]*>([\s\S]*?)<\/div>/i) ||
      block.match(/<span[^>]+class=["'][^"']*a-size-base\+?[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
    const snippet = htmlEntityDecode(stripHtmlTags(snippetMatch?.[1] || "")).replace(/\s+/g, " ").trim();
    const imageMatch = block.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
    const imageUrl = normalizeAbsoluteUrl(imageMatch?.[1] || "");
    items.push({
      title: title || `Amazon product ${asin}`,
      link: `https://www.amazon.com/dp/${asin}`,
      snippet: snippet || undefined,
      imageUrl: imageUrl || undefined,
    });
  }
  return items;
}

async function scrapeAmazonSearchPage(query: string, page: number): Promise<CseItem[]> {
  const url = buildAmazonSearchPageUrl(query, page);
  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  if (!response.ok) throw new Error(`Amazon search scrape failed: ${response.status}`);
  const html = await response.text();
  return parseAmazonSearchResultsFromHtml(html);
}

async function searchCseWithBrutalCache(args: {
  runId?: string;
  source: OfferSource;
  query: string;
  num: number;
  start?: number;
  context: Record<string, unknown>;
}): Promise<{ items: CseItem[]; meta: CseFetchMeta }> {
  if (args.source !== "AMAZON") {
    return {
      items: [],
      meta: { fromCache: "NONE", quotaError: false, usedFallback: false, errorMessage: "amazon-only-mode" },
    };
  }
  const start = Math.max(1, Math.min(91, args.start ?? 1));
  const cacheKey = makeCseCacheKey(args.query, args.num, start);
  const cachedFresh = await getCache<CseCachePayload>(cacheKey);
  if (cachedFresh && Array.isArray(cachedFresh.items) && cachedFresh.items.length > 0) {
    await logStep(args.runId, "CSE_FETCH_CACHE_FRESH", "OK", { cacheKey, ...args.context }, { count: cachedFresh.items.length });
    return {
      items: cachedFresh.items,
      meta: { fromCache: "FRESH", quotaError: false, usedFallback: false, errorMessage: null },
    };
  }

  try {
    const page = Math.floor((start - 1) / 10) + 1;
    const items = await scrapeAmazonSearchPage(args.query, page);
    const payload: CseCachePayload = {
      source: args.source,
      query: args.query,
      num: args.num,
      start,
      fetchedAt: new Date().toISOString(),
      items,
    };
    await setCache(cacheKey, payload, CSE_CACHE_TTL_DAYS);
    await logStep(args.runId, "CSE_FETCH_LIVE", "OK", { cacheKey, ...args.context }, { count: items.length });
    return {
      items,
      meta: { fromCache: "NONE", quotaError: false, usedFallback: false, errorMessage: null },
    };
  } catch (error) {
    const quota = false;
    const cachedAny = await getCacheIncludingExpired<CseCachePayload>(cacheKey);
    if (cachedAny && Array.isArray(cachedAny.value.items) && cachedAny.value.items.length > 0) {
      await logStep(
        args.runId,
        "CSE_FETCH_CACHE_STALE_FALLBACK",
        "WARN",
        { cacheKey, quota, expired: cachedAny.expired, ...args.context },
        { count: cachedAny.value.items.length },
        error instanceof Error ? error.message : String(error),
      );
      return {
        items: cachedAny.value.items,
        meta: {
          fromCache: "STALE",
          quotaError: quota,
          usedFallback: true,
          errorMessage: error instanceof Error ? error.message : String(error),
        },
      };
    }
    await logStep(
      args.runId,
      "CSE_FETCH_FAILED_NO_CACHE",
      quota ? "WARN" : "ERROR",
      { cacheKey, quota, ...args.context },
      { count: 0 },
      error instanceof Error ? error.message : String(error),
    );
    return {
      items: [],
      meta: {
        fromCache: "NONE",
        quotaError: quota,
        usedFallback: false,
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

async function callOpenAIJson(prompt: string, input: unknown) {
  if (!process.env.OPENAI_API_KEY) return null;
  const callOnce = async (fullPrompt: string) => {
    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        input: `${fullPrompt}\n\nINPUT_JSON:\n${JSON.stringify(input)}`,
        temperature: 0.2,
      }),
    });
    if (!resp.ok) return null;
    const json = (await resp.json()) as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };
    const flat = String(json.output_text || "").trim();
    const nested = Array.isArray(json.output)
      ? json.output.flatMap((x) => (Array.isArray(x.content) ? x.content : [])).map((c) => String(c.text || "")).join("\n").trim()
      : "";
    const text = (flat || nested).trim();
    if (!text) return null;
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first < 0 || last <= first) return null;
    try {
      return JSON.parse(text.slice(first, last + 1)) as Record<string, unknown>;
    } catch {
      return null;
    }
  };
  const first = await callOnce(prompt);
  if (first) return first;
  const retryPrompt = `IMPORTANT: Return ONLY valid JSON, no markdown, no prose.\n${prompt}`;
  return callOnce(retryPrompt);
}

async function buildUniquePageSlug(baseSlug: string): Promise<string> {
  const normalized = baseSlug.replace(/\/+/g, "/").replace(/^\/|\/$/g, "");
  let candidate = normalized;
  let index = 2;
  // Keep slug human-readable, no ASIN/hash suffix.
  while (true) {
    const found = await prisma.page.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!found) return candidate;
    candidate = `${normalized}-${index}`;
    index += 1;
    if (index > 200) return `${normalized}-${Date.now()}`;
  }
}

// Legacy partner helper kept for quick rollback to multi-partner mode.
function partnerDomainIsProductLike(source: OfferSource, url: string) {
  try {
    const p = new URL(url).pathname.toLowerCase();
    if (source === "EBAY") return /\/itm\//.test(p);
    if (source === "ALIEXPRESS") return /\/item\//.test(p);
    if (source === "TEMU") return /\/goods\.html|\/-g-/.test(p);
    if (source === "ALIBABA") return /\/product-detail\//.test(p);
    return false;
  } catch {
    return false;
  }
}

// Legacy helper kept for quick rollback experiments.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function pickAmazonProductByPrompt(args: {
  runId?: string;
  category: string;
  cseResults: CseItem[];
}): Promise<{ chosen: AmazonSelected | null; rejected: Array<{ url: string; reason: string }>; reason: string }> {
  const valid = args.cseResults
    .map((r) => ({ ...r, asin: parseASIN(r.link) }))
    .filter((r) => Boolean(r.asin) && isValidAmazonProductUrl(r.link)) as Array<CseItem & { asin: string }>;

  const fallback = valid[0]
    ? {
        chosen: {
          asin: valid[0].asin,
          url: `https://www.amazon.com/dp/${valid[0].asin}`,
          title: valid[0].title,
          snippet: valid[0].snippet || "",
        },
        rejected: args.cseResults
          .filter((r) => r.link !== valid[0].link)
          .map((r) => ({ url: r.link, reason: parseASIN(r.link) ? "LOW_RELEVANCE" : "NO_ASIN" })),
        reason: "Fallback selected first valid ASIN product page.",
      }
    : {
        chosen: null,
        rejected: args.cseResults.map((r) => ({ url: r.link, reason: "NO_ASIN" })),
        reason: "No valid ASIN product pages found.",
      };

  const prompt = `You are an Amazon product selector. Your job is to pick exactly ONE specific Amazon PRODUCT page from Google CSE results.
HARD RULES:
- Only accept URLs with /dp/<ASIN>, /*/dp/<ASIN>, /gp/product/<ASIN>
- Extract ASIN with regex: \\b[A-Z0-9]{10}\\b
- Reject category/search/list pages.
- Return JSON only.`;
  const ai = await callOpenAIJson(prompt, {
    category: args.category,
    cse_results: args.cseResults.map((x) => ({ title: x.title, url: x.link, snippet: x.snippet || "" })),
  });

  if (!ai || ai.status === "NO_VALID_PRODUCT") {
    await logStep(args.runId, "AMAZON_SELECTION_PROMPT", fallback.chosen ? "WARN" : "ERROR", { category: args.category }, fallback, "AI missing or no valid product");
    return fallback;
  }

  const chosenRaw = (ai.chosen || null) as Record<string, unknown> | null;
  const chosenUrl = typeof chosenRaw?.url === "string" ? chosenRaw.url : "";
  const asin = typeof chosenRaw?.asin === "string" ? chosenRaw.asin.toUpperCase() : parseASIN(chosenUrl);
  if (!chosenUrl || !asin || !isValidAmazonProductUrl(chosenUrl)) {
    await logStep(args.runId, "AMAZON_SELECTION_PROMPT", "WARN", { category: args.category }, ai, "Invalid AI selection; fallback used");
    return fallback;
  }

  const out = {
    chosen: {
      asin,
      url: `https://www.amazon.com/dp/${asin}`,
      title: String(chosenRaw?.title || ""),
      snippet: String(chosenRaw?.snippet || ""),
    },
    rejected: Array.isArray(ai.rejected) ? (ai.rejected as Array<{ url: string; reason: string }>) : fallback.rejected,
    reason: String(ai.reason || "AI selected product"),
  };
  await logStep(args.runId, "AMAZON_SELECTION_PROMPT", "OK", { category: args.category }, out);
  return out;
}

// Legacy partner selector kept for quick rollback to multi-partner mode.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function selectPartnerOffersByPrompt(args: {
  runId?: string;
  category: string;
  amazon: AmazonSelected;
  partnerCandidates: PartnerCandidate[];
}) {
  type SelectedPartner = {
    source: OfferSource;
    title: string;
    url: string;
    price: number | null;
    currency: "USD" | null;
    matchType: string;
    matchRationale: string;
    confidence: number;
  };

  const dedup = new Map<string, PartnerCandidate>();
  for (const c of args.partnerCandidates) {
    const key = `${c.source}:${c.url}`;
    if (!dedup.has(key)) dedup.set(key, c);
  }
  const candidates = Array.from(dedup.values()).filter((c) => partnerDomainIsProductLike(c.source, c.url));

  const fallbackSelected: SelectedPartner[] = candidates
    .sort((a, b) => {
      const ap = a.parsedPrice?.price;
      const bp = b.parsedPrice?.price;
      if (ap != null && bp != null) return ap - bp;
      if (ap != null) return -1;
      if (bp != null) return 1;
      return 0;
    })
    .slice(0, Math.min(5, Math.max(3, Math.min(5, candidates.length))))
    .map((c) => ({
      source: c.source,
      title: c.title,
      url: c.url,
      price: c.parsedPrice?.price ?? null,
      currency: c.parsedPrice?.currency ?? null,
      matchType: "NEAR_MATCH",
      matchRationale: "Fallback relevance/price selection.",
      confidence: c.parsedPrice ? 0.7 : 0.45,
    }));

  const prompt = `You are a partner-offer selector for an affiliate comparison site.
GOAL: choose best non-Amazon offers. Prefer same-product, then near-match, then complementary. JSON only.`;
  const ai = await callOpenAIJson(prompt, {
    category: args.category,
    amazon_product: args.amazon,
    partner_candidates: candidates,
  });

  let selected: SelectedPartner[] = fallbackSelected;
  if (ai && Array.isArray(ai.selectedOffers)) {
    selected = (ai.selectedOffers as Array<Record<string, unknown>>)
      .map((x) => ({
        source: String(x.source || "OTHER") as OfferSource,
        title: String(x.title || ""),
        url: String(x.url || ""),
        price: typeof x.price === "number" ? x.price : null,
        currency: (x.currency === "USD" ? "USD" : null) as "USD" | null,
        matchType: String(x.matchType || "NEAR_MATCH"),
        matchRationale: String(x.matchRationale || ""),
        confidence: typeof x.confidence === "number" ? x.confidence : 0.5,
      }))
      .filter((x) => x.source !== "AMAZON" && x.url && partnerDomainIsProductLike(x.source, x.url))
      .slice(0, 5);
  }

  const sorted = selected.sort((a, b) => {
    if (a.price != null && b.price != null) return a.price - b.price;
    if (a.price != null) return -1;
    if (b.price != null) return 1;
    return b.confidence - a.confidence;
  });

  if (candidates.length >= 3 && sorted.length < 3) {
    const fallbackFill = fallbackSelected.filter((f) => !sorted.some((s) => s.url === f.url)).slice(0, 3 - sorted.length);
    sorted.push(...fallbackFill);
  }

  const bySource = new Map<OfferSource, SelectedPartner>();
  for (const item of sorted) {
    if (!bySource.has(item.source)) {
      bySource.set(item.source, item);
      continue;
    }
    const current = bySource.get(item.source)!;
    const currentRank = current.price != null ? current.price : Number.POSITIVE_INFINITY;
    const nextRank = item.price != null ? item.price : Number.POSITIVE_INFINITY;
    if (nextRank < currentRank) bySource.set(item.source, item);
  }

  const uniqueBySource = Array.from(bySource.values())
    .sort((a, b) => {
      if (a.price != null && b.price != null) return a.price - b.price;
      if (a.price != null) return -1;
      if (b.price != null) return 1;
      return b.confidence - a.confidence;
    })
    .slice(0, 2);

  await logStep(args.runId, "PARTNER_SELECTOR_PROMPT", "OK", { category: args.category, amazon: args.amazon }, { selected: uniqueBySource, totalCandidates: candidates.length });
  return uniqueBySource;
}

async function buildReviewAndOfferJson(args: {
  runId?: string;
  category: string;
  amazon: AmazonSelected;
  amazonBestEffortPrice: { price: number; currency: "USD"; lastUpdated: string; confidence: number } | null;
  partnerOffers: Array<{ source: string; title: string; url: string; price: number | null; currency: "USD" | null; confidence: number }>;
  partnerTag: string;
  scraped: ScrapedListingData | null;
}) {
  const fallback = {
    product: {
      asin: args.amazon.asin,
      amazonUrl: `https://www.amazon.com/dp/${args.amazon.asin}`,
      title: args.amazon.title,
      category: args.category,
    },
    review: {
      tldr: `A ${args.amazon.title} appears relevant for ${args.category}. This summary is based on listing info only.`,
      pros: ["Amazon product page validated by ASIN", "Category-relevant listing title", "Has comparable partner alternatives"],
      cons: ["Detailed specs are not fully available", "Amazon real-time price may vary", "Partner match confidence may differ by listing"],
      bestFor: ["Shoppers comparing offers", "Users who want ASIN-validated Amazon page", "Quick buying decisions"],
      notFor: ["Users requiring full lab-test depth", "People needing verified in-stock guarantee"],
      keyFeatures: [args.scraped?.title || args.amazon.title, args.category, "ASIN-validated URL", "Offer comparison", "Affiliate-safe CTA"],
      disclaimer: "This page may include affiliate links.",
    },
    offers: [],
    explanations: {
      whyThisAmazonProduct: "Chosen because URL is ASIN-validated and relevant to the niche query.",
      whyThesePartnerOffers: "Selected by relevance and available price signals, then sorted by price.",
    },
  };

  const prompt = `You are a product review writer for buyers (not developers).
Write concrete, user-facing review fields from listing highlights.
Rules:
- pros/cons/bestFor/notFor must be practical buying guidance.
- do not repeat the same sentence across fields.
- do not mention internal pipeline terms (ASIN, selector, fallback, cache, etc).
- if category is smartwatch, "notFor" should explicitly mention advanced athletes/triathlon when relevant.
- disclaimer must be exactly: "This page may include affiliate links."
Return strict JSON only.`;
  const ai = await callOpenAIJson(prompt, {
    category: args.category,
    amazon_product: args.amazon,
    scraped_listing: args.scraped,
    amazon_best_effort_price: args.amazonBestEffortPrice,
    partner_candidates: args.partnerOffers,
    PARTNER_TAG: args.partnerTag,
  });

  const out = ai && typeof ai === "object" ? ai : fallback;
  await logStep(args.runId, "REVIEW_OFFER_BUILDER_PROMPT", ai ? "OK" : "WARN", { category: args.category, asin: args.amazon.asin }, out, ai ? undefined : "fallback-review-json");
  return out as Record<string, unknown>;
}

export async function runProductionSafeAutomationPipeline(config: AutomationConfigLike, opts?: { runId?: string }): Promise<PipelineResult> {
  const amazonTag =
    process.env.AMAZON_CREATOR_PARTNER_TAG ||
    process.env.AMAZON_PAAPI_PARTNER_TAG ||
    (await prisma.affiliateAccount.findFirst({
      where: { isActive: true, partner: { source: "AMAZON", isEnabled: true } },
      select: { trackingId: true },
      orderBy: { updatedAt: "desc" },
    }))?.trackingId ||
    null;

  if (!amazonTag) throw new Error("Amazon partner tag is required (AMAZON_CREATOR_PARTNER_TAG or active Amazon account trackingId).");

  const niches = await prisma.automationNiche.findMany({
    where: { source: config.source, isEnabled: true },
    orderBy: [{ priority: "asc" }, { updatedAt: "desc" }],
  });

  let nichesUsed = 0;
  let requestedPosts = 0;
  let createdPages = 0;
  let updatedPages = 0;
  let generatedOffers = 0;
  let createdOffers = 0;
  let updatedOffers = 0;
  let skippedNoValidAmazon = 0;
  let cseCalls = 0;
  let cseCacheHitsFresh = 0;
  let cseCacheHitsStaleFallback = 0;
  let cseQuotaErrors = 0;

  for (const niche of niches) {
    requestedPosts += niche.maxItems;
    const postsForNiche = Math.max(1, Math.min(10, niche.maxItems));
    let successfulInNiche = 0;
    const existingProductsInCategory = await prisma.product.findMany({
      where: { category: niche.categoryPath },
      select: { attributes: true },
      take: 1000,
    });
    const existingAsins = new Set(
      existingProductsInCategory
        .map((p) => {
          const a = p.attributes as Record<string, unknown> | null;
          return a && typeof a.asin === "string" ? a.asin.toUpperCase() : "";
        })
        .filter(Boolean),
    );

    const nicheAmazonQuery = buildAmazonSearchQuery(niche.keywords || niche.categoryPath);
    const nicheAmazonResults: CseItem[] = [];
    const nicheMeta: CseFetchMeta[] = [];
    const seenAmazonLinks = new Set<string>();
    const perPageNum = 10;
    const maxPages = 10;
    for (let page = 1; page <= maxPages; page += 1) {
      const start = (page - 1) * 10 + 1;
      const pageFetch = await searchCseWithBrutalCache({
        runId: opts?.runId,
        source: "AMAZON",
        query: nicheAmazonQuery,
        num: perPageNum,
        start,
        context: { category: niche.categoryPath, stage: "amazon", start },
      });
      cseCalls += 1;
      if (pageFetch.meta.fromCache === "FRESH") cseCacheHitsFresh += 1;
      if (pageFetch.meta.fromCache === "STALE") cseCacheHitsStaleFallback += 1;
      if (pageFetch.meta.quotaError) cseQuotaErrors += 1;
      nicheMeta.push(pageFetch.meta);
      for (const item of pageFetch.items) {
        if (seenAmazonLinks.has(item.link)) continue;
        seenAmazonLinks.add(item.link);
        nicheAmazonResults.push(item);
      }
      if (pageFetch.items.length < perPageNum) break;

      const scanMap = new Map<string, AmazonSelected>();
      for (const item of nicheAmazonResults) {
        const asin = parseASIN(item.link);
        if (!asin || !isValidAmazonProductUrl(item.link)) continue;
        if (!scanMap.has(asin)) {
          scanMap.set(asin, {
            asin,
            url: `https://www.amazon.com/dp/${asin}`,
            title: item.title || "",
            snippet: item.snippet || "",
            imageUrl: item.imageUrl,
          });
        }
      }
      const scanCandidates = Array.from(scanMap.values()).filter((x) => !existingAsins.has(x.asin));
      if (scanCandidates.length >= postsForNiche) break;
    }
    const validByAsin = new Map<string, AmazonSelected>();
    for (const item of nicheAmazonResults) {
      const asin = parseASIN(item.link);
      if (!asin || !isValidAmazonProductUrl(item.link)) continue;
      if (!validByAsin.has(asin)) {
        validByAsin.set(asin, {
          asin,
          url: `https://www.amazon.com/dp/${asin}`,
          title: item.title || "",
          snippet: item.snippet || "",
          imageUrl: item.imageUrl,
        });
      }
    }
    const freshCandidates = Array.from(validByAsin.values()).filter((x) => !existingAsins.has(x.asin));
    const nicheCandidates = freshCandidates.slice(0, postsForNiche);
    await logStep(opts?.runId, "CSE_AMAZON", "OK", { query: nicheAmazonQuery, category: niche.categoryPath }, {
      top: nicheAmazonResults.slice(0, 10).map((x) => ({ title: x.title, url: x.link, snippet: x.snippet || "" })),
      cseMeta: nicheMeta,
      validCandidateCount: nicheCandidates.length,
    });
    if (nicheCandidates.length === 0) {
      skippedNoValidAmazon += postsForNiche;
      await logStep(
        opts?.runId,
        "NO_FRESH_CANDIDATES",
        "WARN",
        { category: niche.categoryPath, requested: postsForNiche },
        { freshFound: 0, totalValid: validByAsin.size },
        "No fresh ASIN found for category; skipping to avoid reusing existing page.",
      );
      continue;
    }

    for (let i = 0; i < postsForNiche; i += 1) {
      const chosen = nicheCandidates[i];
      if (!chosen) break;

      const amazonBestEffortPriceRaw = parsePriceFromSnippet(chosen.snippet || "");
      const amazonBestEffortPrice = amazonBestEffortPriceRaw
        ? {
            price: amazonBestEffortPriceRaw.price,
            currency: "USD" as const,
            lastUpdated: new Date().toISOString(),
            confidence: 0.55,
          }
        : null;

      const scrapedListing = await scrapeSelectedListingData(chosen.url, opts?.runId);

      const reviewCacheKey = `asin-review:v3:${chosen.asin}:${stableHash(
        `${niche.categoryPath}|${scrapedListing?.title || ""}|${(scrapedListing?.bullets || []).join("|")}|format=v3`,
      )}`;
      let reviewJson = await getCache<Record<string, unknown>>(reviewCacheKey);
      if (!reviewJson) {
        reviewJson = await buildReviewAndOfferJson({
          runId: opts?.runId,
          category: niche.categoryPath,
          amazon: chosen,
          amazonBestEffortPrice,
          partnerOffers: [],
          partnerTag: amazonTag,
          scraped: scrapedListing,
        });
        await setCache(reviewCacheKey, reviewJson, 30);
      } else {
        await logStep(opts?.runId, "REVIEW_CACHE_HIT", "OK", { key: reviewCacheKey }, { hit: true });
      }

      const productTitle = cleanProductTitle(scrapedListing?.title || chosen.title) || `Amazon Product ${chosen.asin}`;
      const normalizedProductTitle = isGenericTitle(productTitle) ? cleanProductTitle(chosen.title) || `${categoryLabel(niche.categoryPath)} Product` : productTitle;
      const productId = `prod_${stableHash(`${niche.categoryPath}:${chosen.asin}`)}`;
      const product = await prisma.product.upsert({
        where: { id: productId },
        update: { canonicalName: productTitle, category: niche.categoryPath, attributes: { asin: chosen.asin } as never },
        create: { id: productId, canonicalName: productTitle, category: niche.categoryPath, attributes: { asin: chosen.asin } as never },
        select: { id: true },
      });

      const amazonAffiliateUrl = `https://www.amazon.com/dp/${chosen.asin}?tag=${encodeURIComponent(amazonTag)}`;
      const amazonValidation = validateAffiliateUrl("AMAZON", amazonAffiliateUrl, { amazonTrackingId: amazonTag });
      if (!amazonValidation.ok) {
        await logStep(opts?.runId, "AMAZON_AFFILIATE_VALIDATE", "ERROR", { asin: chosen.asin }, { url: amazonAffiliateUrl }, amazonValidation.reason);
        skippedNoValidAmazon += 1;
        continue;
      }

      const amazonOfferItem: OfferIngestItem = {
        source: "AMAZON",
        externalId: `AMAZON_${chosen.asin}`,
        title: normalizedProductTitle,
        price: amazonBestEffortPrice?.price ?? null,
        currency: "USD",
        affiliateUrl: amazonAffiliateUrl,
        imageUrl: null,
        productName: normalizedProductTitle,
        productCategory: niche.categoryPath,
        productId: product.id,
        partnerName: "Amazon US",
        payload: {
          mode: "amazon-main-offer",
          asin: chosen.asin,
          amazonUrl: chosen.url,
          policy: "No Amazon HTML scraping; best-effort price from snippet only.",
        } as never,
      };

      const ingest = await ingestOfferItems([amazonOfferItem]);
      generatedOffers += ingest.processed;
      createdOffers += ingest.createdOffers;
      updatedOffers += ingest.updatedOffers;

      const baseSlug = `${niche.categoryPath}/${toSlug(normalizedProductTitle)}`;
      const pageSlug = await buildUniquePageSlug(baseSlug);
      const offers = await prisma.offer.findMany({
        where: { productId: product.id },
        include: { partner: true },
      });

      const sortedOffers = offers
        .map((o) => ({
          source: o.source,
          price: o.price ? Number(o.price) : null,
          currency: o.currency,
          url: `/go/${o.id}?ref=offer-box`,
          cta:
            o.source === "AMAZON"
              ? o.price
                ? "View on Amazon"
                : "Check price on Amazon (price may vary)"
              : "View offer",
          lastUpdated: (o.lastUpdated || o.updatedAt).toISOString(),
          confidence: o.price ? 0.75 : 0.4,
          title: o.title || `${o.source} offer`,
          isPrimary: (o.externalId || "").startsWith("AMAZON_") && !(o.externalId || "").startsWith("AMAZON_ALT_"),
        }))
        .sort((a, b) => {
          if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
          if (a.price != null && b.price != null) return a.price - b.price;
          if (a.price != null) return -1;
          if (b.price != null) return 1;
          return 0;
        });

      const uniqueTopOffers = sortedOffers.slice(0, MAX_TOTAL_OFFERS_PER_PAGE);

      const review = (reviewJson.review || {}) as Record<string, unknown>;
      const listingHighlights = (scrapedListing?.bullets || []).slice(0, 6);
      const prosCandidate = nonEmptyLines(
        review.pros,
        buildFallbackReview({
          productTitle: normalizedProductTitle,
          category: categoryLabel(niche.categoryPath),
          bullets: scrapedListing?.bullets || [],
          partnerOffersCount: uniqueTopOffers.length,
        }).pros,
      );
      const highlightsNorm = new Set(listingHighlights.map((x) => normalizeCompareText(x)));
      const prosFiltered = prosCandidate.filter((x) => !highlightsNorm.has(normalizeCompareText(String(x))));
      const prosFinal = (prosFiltered.length ? prosFiltered : buildProsFromHighlights(listingHighlights)).slice(0, 5);
      const logs = {
        cseQueryAmazon: nicheAmazonQuery,
        cseTopResultsAmazon: nicheAmazonResults.slice(0, 10).map((x) => ({ title: x.title, url: x.link, snippet: x.snippet || "" })),
        chosenAmazonReason: "ASIN-validated product page selected from niche query results.",
        cseQueryPartners: null,
        cseTopResultsPartners: [],
        chosenPartnersReason: "Amazon-only mode: single primary product offer.",
      };

      const finalJson = {
        product: {
          asin: chosen.asin,
          amazonUrl: `https://www.amazon.com/dp/${chosen.asin}`,
          title: productTitle,
          category: niche.categoryPath,
        },
        review: {
          tldr: String(
            review.tldr ||
              buildFallbackReview({
                productTitle: normalizedProductTitle,
                category: categoryLabel(niche.categoryPath),
                bullets: scrapedListing?.bullets || [],
                partnerOffersCount: uniqueTopOffers.length,
              }).tldr,
          ),
          pros: nonEmptyLines(
            prosFinal,
            buildProsFromHighlights(listingHighlights),
          ),
          cons: nonEmptyLines(
            review.cons,
            buildFallbackReview({
              productTitle: normalizedProductTitle,
              category: categoryLabel(niche.categoryPath),
              bullets: scrapedListing?.bullets || [],
              partnerOffersCount: uniqueTopOffers.length,
            }).cons,
          ),
          bestFor: nonEmptyLines(
            review.bestFor,
            buildFallbackReview({
              productTitle: normalizedProductTitle,
              category: categoryLabel(niche.categoryPath),
              bullets: scrapedListing?.bullets || [],
              partnerOffersCount: uniqueTopOffers.length,
            }).bestFor,
          ),
          notFor: nonEmptyLines(
            review.notFor,
            buildFallbackReview({
              productTitle: normalizedProductTitle,
              category: categoryLabel(niche.categoryPath),
              bullets: scrapedListing?.bullets || [],
              partnerOffersCount: uniqueTopOffers.length,
            }).notFor,
          ),
          keyFeatures: nonEmptyLines(
            review.keyFeatures,
            buildFallbackReview({
              productTitle: normalizedProductTitle,
              category: categoryLabel(niche.categoryPath),
              bullets: scrapedListing?.bullets || [],
              partnerOffersCount: uniqueTopOffers.length,
            }).keyFeatures,
          ),
          disclaimer: "This page may include affiliate links.",
        },
        offers: uniqueTopOffers,
        logs,
      };

      const md = [
        ...(scrapedListing?.bullets?.length
          ? [
              "## Listing Highlights",
              ...listingHighlights.map((x) => `- ${x}`),
              "",
            ]
          : []),
        ...((finalJson.review.pros as string[])?.length
          ? ["## Pros", ...(finalJson.review.pros as string[]).map((x) => `- ${x}`), ""]
          : []),
        ...((finalJson.review.cons as string[])?.length
          ? ["## Cons", ...(finalJson.review.cons as string[]).map((x) => `- ${x}`), ""]
          : []),
        ...((finalJson.review.bestFor as string[])?.length
          ? ["## Best For", ...(finalJson.review.bestFor as string[]).map((x) => `- ${x}`), ""]
          : []),
        ...((finalJson.review.notFor as string[])?.length
          ? ["## Not For", ...(finalJson.review.notFor as string[]).map((x) => `- ${x}`), ""]
          : []),
        "## Disclaimer",
        "This page may include affiliate links.",
      ].join("\n");

      const existing = await prisma.page.findUnique({ where: { slug: pageSlug }, select: { id: true } });
      const page = existing
        ? await prisma.page.update({
            where: { id: existing.id },
            data: {
              productId: product.id,
              type: "REVIEW",
              title: `${normalizedProductTitle} Review`,
              excerpt: `${String(scrapedListing?.description || finalJson.review.tldr).slice(0, 220)}`,
              contentMd: md,
              heroImageUrl: scrapedListing?.images?.[0] || chosen.imageUrl || null,
              status: config.publishMode === "PUBLISHED" ? "PUBLISHED" : "DRAFT",
              publishedAt: config.publishMode === "PUBLISHED" ? new Date() : null,
            },
            select: { id: true },
          })
        : await prisma.page.create({
            data: {
              slug: pageSlug,
              productId: product.id,
              type: "REVIEW",
              title: `${normalizedProductTitle} Review`,
              excerpt: `${String(scrapedListing?.description || finalJson.review.tldr).slice(0, 220)}`,
              contentMd: md,
              heroImageUrl: scrapedListing?.images?.[0] || chosen.imageUrl || null,
              status: config.publishMode === "PUBLISHED" ? "PUBLISHED" : "DRAFT",
              publishedAt: config.publishMode === "PUBLISHED" ? new Date() : null,
            },
            select: { id: true },
          });

      await prisma.aiGenerationLog.create({
        data: {
          runId: opts?.runId ?? null,
          pageId: page.id,
          categoryPath: niche.categoryPath,
          keyword: niche.keywords,
          productName: productTitle,
          model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
          provider: "openai",
          usedAi: Boolean(process.env.OPENAI_API_KEY),
          fallbackUsed: !process.env.OPENAI_API_KEY,
          promptHash: stableHash(`${niche.categoryPath}:${chosen.asin}`),
          promptChars: JSON.stringify(logs).length,
          outputChars: JSON.stringify(finalJson).length,
          qualityScore: Math.min(100, 40 + uniqueTopOffers.length * 8),
          errorMessage: null,
        },
      });

      await prisma.automationPatternSignal.create({
        data: {
          source: "AMAZON",
          categoryPath: niche.categoryPath,
          keyword: niche.keywords,
          productName: productTitle,
          amazonQuery: logs.cseQueryAmazon,
          competitorQueries: { mode: "amazon-only", alternatives: 2 } as never,
          competitorsFound: 0,
          validOffersCount: uniqueTopOffers.length,
          aiUsed: Boolean(process.env.OPENAI_API_KEY),
          qualityScore: Math.min(100, 40 + uniqueTopOffers.length * 8),
        },
      });

      await logStep(opts?.runId, "FINAL_JSON", "OK", { asin: chosen.asin, category: niche.categoryPath }, finalJson);

      successfulInNiche += 1;
      if (existing) updatedPages += 1;
      else createdPages += 1;
    }

    if (successfulInNiche > 0) nichesUsed += 1;
  }

  return {
    nichesUsed,
    requestedPosts,
    createdPages,
    updatedPages,
    generatedOffers,
    createdOffers,
    updatedOffers,
    skippedNoValidAmazon,
    cseCalls,
    cseCacheHitsFresh,
    cseCacheHitsStaleFallback,
    cseQuotaErrors,
  };
}

export async function refreshPublishedOffersDaily(opts?: { runId?: string; limit?: number }) {
  const pages = await prisma.page.findMany({
    where: { status: "PUBLISHED", productId: { not: null } },
    take: Math.max(1, Math.min(200, opts?.limit ?? 50)),
    orderBy: [{ updatedAt: "desc" }],
    include: { product: true },
  });

  for (const page of pages) {
    const asin = typeof page.product?.attributes === "object" && page.product?.attributes && "asin" in (page.product.attributes as Record<string, unknown>)
      ? String((page.product.attributes as Record<string, unknown>).asin || "")
      : "";

    const amazonOffer = await prisma.offer.findFirst({
      where: { productId: page.productId!, source: "AMAZON" },
      orderBy: { updatedAt: "desc" },
    });

    const currentAmazonUrl = amazonOffer?.affiliateUrl || (asin ? `https://www.amazon.com/dp/${asin}` : "");
    const currentAsin = parseASIN(currentAmazonUrl);
    let statusOk = false;
    if (currentAmazonUrl) {
      try {
        const r = await fetch(currentAmazonUrl, { method: "GET", cache: "no-store" });
        statusOk = r.status < 400;
      } catch {
        statusOk = false;
      }
    }

    if (!currentAsin || !statusOk) {
      await logStep(opts?.runId, "DAILY_REFRESH_ASIN_ROTATE", "WARN", { pageId: page.id, oldUrl: currentAmazonUrl }, { rotated: true }, "Amazon URL invalid/non-200; needs reselection");
      continue;
    }

    await logStep(
      opts?.runId,
      "DAILY_REFRESH_AMAZON_ONLY",
      "OK",
      { pageId: page.id, asin: currentAsin },
      { refreshed: true },
      "Amazon-only mode enabled; partner refresh skipped.",
    );
  }
}

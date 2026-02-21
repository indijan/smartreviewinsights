import crypto from "node:crypto";
import { categoryLabel } from "@/lib/category-taxonomy";
import { mirrorImagesToR2 } from "@/lib/r2-media";
import { validateAffiliateUrl } from "@/lib/offers/affiliate-validation";
import { ingestOfferItems } from "@/lib/offers/ingest";
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
  aiAttempts: number;
  aiFailures: number;
};

type AutomationConfigLike = {
  publishMode?: string | null;
};

type CleanPipelineOptions = {
  runId?: string;
  targetCategoryPaths?: string[];
  forceMaxItemsPerNiche?: number;
  maxTotalPosts?: number;
};

type SearchItem = {
  asin: string;
  url: string;
  title: string;
  snippet: string;
  imageUrl?: string;
};

type ScrapedProduct = {
  asin: string;
  url: string;
  title: string;
  description: string;
  bullets: string[];
  images: string[];
  price: number | null;
};

const MAX_PRODUCT_IMAGES = 4;

type RecentPageTitle = {
  id: string;
  slug: string;
  title: string;
};

const RECENT_TITLE_DUPLICATE_WINDOW_DAYS = 7;

function hash(value: string) {
  return crypto.createHash("sha1").update(value).digest("hex");
}

function toSlug(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

function cleanText(input: string) {
  return String(input || "").replace(/\s+/g, " ").trim();
}

function normalizeTitleForDedupe(input: string) {
  return cleanText(input)
    .replace(/^amazon\.com\s*:?\s*/i, "")
    .replace(/\s+-\s+smart review$/i, "")
    .replace(/\breview\b/gi, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function isLikelyDuplicateTitle(candidate: string, existing: string) {
  const a = normalizeTitleForDedupe(candidate);
  const b = normalizeTitleForDedupe(existing);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 28 && b.length >= 28 && (a.includes(b) || b.includes(a))) return true;
  return false;
}

function stripHtml(input: string) {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtml(input: string) {
  return input
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&nbsp;", " ");
}

function parseASIN(url: string): string | null {
  const m1 = url.match(/\/dp\/([A-Z0-9]{10})(?:[/?#]|$)/i);
  if (m1?.[1]) return m1[1].toUpperCase();
  const m2 = url.match(/\/gp\/product\/([A-Z0-9]{10})(?:[/?#]|$)/i);
  if (m2?.[1]) return m2[1].toUpperCase();
  return null;
}

function normalizeAmazonProductUrl(url: string, asin?: string) {
  const a = asin || parseASIN(url);
  if (!a) return "";
  return `https://www.amazon.com/dp/${a}`;
}

function extractKeywordFromNicheInput(raw: string) {
  const value = cleanText(raw);
  if (!/^https?:\/\//i.test(value)) return value;
  try {
    const u = new URL(value);
    return cleanText(
      u.searchParams.get("k") ||
        u.searchParams.get("keywords") ||
        u.searchParams.get("field-keywords") ||
        value,
    );
  } catch {
    return value;
  }
}

function searchUrlFromKeyword(keyword: string, page: number) {
  return `https://www.amazon.com/s?k=${encodeURIComponent(keyword)}&page=${page}`;
}

function parsePriceLoose(text: string): number | null {
  const m = text.match(/\$\s*([0-9]{1,5}(?:[.,][0-9]{2})?)/);
  if (!m?.[1]) return null;
  const n = Number(m[1].replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function parsePriceFromHtml(html: string): number | null {
  const patterns = [
    /["']price["']\s*:\s*["']?\$?\s*([0-9]{1,5}(?:[.,][0-9]{2})?)["']?/i,
    /<span[^>]+class=["'][^"']*a-price-whole[^"']*["'][^>]*>\s*([0-9]{1,5})\s*<\/span>[\s\S]{0,140}?<span[^>]+class=["'][^"']*a-price-fraction[^"']*["'][^>]*>\s*([0-9]{2})\s*<\/span>/i,
    /<span[^>]+class=["'][^"']*a-offscreen[^"']*["'][^>]*>\s*\$?\s*([0-9]{1,5}(?:[.,][0-9]{2})?)\s*<\/span>/i,
    /data-a-price=["']\s*([0-9]{1,5}(?:[.,][0-9]{2})?)\s*["']/i,
  ];

  for (const re of patterns) {
    const m = html.match(re);
    if (!m) continue;
    const value = m[2] ? `${m[1]}.${m[2]}` : m[1];
    const num = Number(String(value).replace(",", "."));
    if (Number.isFinite(num) && num > 0) return num;
  }
  return null;
}

function highResImage(url: string) {
  return String(url || "")
    .replace(/(\._[A-Z0-9,]+_)\./gi, ".")
    .replace(/\._[^/]+_\./g, ".")
    .replace(/(\.jpg|\.jpeg|\.png|\.webp)\?.*$/i, "$1")
    .trim();
}

function imageScore(url: string) {
  let score = 0;
  const nums = Array.from(url.matchAll(/([0-9]{3,4})/g)).map((m) => Number(m[1]));
  if (nums.length > 0) score += Math.max(...nums);
  if (/sl1500|sl2000|ul1500|ux1500|ac_sl1500|ac_ul1500/i.test(url)) score += 2000;
  if (/sprite|icon|thumb|thumbnail|play|logo/i.test(url)) score -= 3000;
  return score;
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

async function getCache<T>(key: string): Promise<T | null> {
  const row = await prisma.automationCache.findUnique({ where: { key } });
  if (!row) return null;
  if (row.expiresAt <= new Date()) return null;
  return row.value as T;
}

async function setCache(key: string, value: unknown, ttlDays: number) {
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
  await prisma.automationCache.upsert({
    where: { key },
    update: { value: value as never, expiresAt },
    create: { key, value: value as never, expiresAt },
  });
}

function parseSearchItems(html: string): SearchItem[] {
  const chunks = html.split(/<div[^>]+data-component-type=["']s-search-result["'][^>]*>/i).slice(1);
  const out: SearchItem[] = [];
  for (const c of chunks) {
    const block = c.slice(0, 10000);
    const linkMatch = block.match(/<a[^>]+href=["']([^"']*\/(?:dp|gp\/product)\/[A-Z0-9]{10}[^"']*)["'][^>]*>/i);
    const rawHref = linkMatch?.[1] || "";
    const absHref = (() => {
      try {
        return new URL(rawHref, "https://www.amazon.com").toString();
      } catch {
        return "";
      }
    })();
    const asin = parseASIN(absHref);
    if (!asin) continue;
    const titleMatch = block.match(/<h2[^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>[\s\S]*?<\/h2>/i);
    const title = cleanText(decodeHtml(stripHtml(titleMatch?.[1] || "")));
    const snippetMatch =
      block.match(/<div[^>]+class=["'][^"']*a-color-secondary[^"']*["'][^>]*>([\s\S]*?)<\/div>/i) ||
      block.match(/<span[^>]+class=["'][^"']*a-size-base[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
    const snippet = cleanText(decodeHtml(stripHtml(snippetMatch?.[1] || "")));
    const imageMatch = block.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
    const imageUrl = cleanText(imageMatch?.[1] || "");
    out.push({
      asin,
      url: normalizeAmazonProductUrl(absHref, asin),
      title: title || `Amazon product ${asin}`,
      snippet,
      imageUrl: imageUrl ? highResImage(imageUrl) : undefined,
    });
  }
  return out;
}

async function scrapeSearchPage(keyword: string, page: number): Promise<SearchItem[]> {
  const cacheKey = `clean-search:${hash(`${keyword}:${page}`)}`;
  const cached = await getCache<SearchItem[]>(cacheKey);
  if (cached?.length) return cached;

  const response = await fetch(searchUrlFromKeyword(keyword, page), {
    method: "GET",
    cache: "no-store",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  if (!response.ok) throw new Error(`Amazon search scrape failed (${response.status})`);
  const html = await response.text();
  const items = parseSearchItems(html);
  await setCache(cacheKey, items, 7);
  return items;
}

function extractMeta(html: string, key: string) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const r1 = new RegExp(`<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i");
  const r2 = new RegExp(`<meta[^>]+name=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i");
  return decodeHtml((html.match(r1)?.[1] || html.match(r2)?.[1] || "").trim());
}

function extractJsonLd(html: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    const raw = m[1]?.trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        for (const item of parsed) if (item && typeof item === "object") out.push(item as Record<string, unknown>);
      } else if (parsed && typeof parsed === "object") {
        out.push(parsed as Record<string, unknown>);
      }
    } catch {
      continue;
    }
  }
  return out;
}

function extractBullets(html: string) {
  const scope = html.match(/<div[^>]+id=["']feature-bullets["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || html;
  const bullets: string[] = [];
  for (const li of scope.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)) {
    const text = cleanText(decodeHtml(stripHtml(li[1] || "")));
    if (!text || text.length < 12) continue;
    if (/customer reviews?/i.test(text)) continue;
    bullets.push(text);
    if (bullets.length >= 10) break;
  }
  return bullets;
}

async function scrapeProduct(asin: string, runId?: string): Promise<ScrapedProduct | null> {
  const url = normalizeAmazonProductUrl(`https://www.amazon.com/dp/${asin}`, asin);
  const cacheKey = `clean-product:${asin}`;
  const cached = await getCache<ScrapedProduct>(cacheKey);
  if (cached) return cached;

  try {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!response.ok) return null;
    const html = await response.text();

    const jsonLd = extractJsonLd(html);
    const images = new Set<string>();
    let jsonLdPrice: number | null = null;
    for (const node of jsonLd) {
      const type = String(node["@type"] || "").toLowerCase();
      if (!type.includes("product")) continue;
      const rawImage = node.image;
      if (typeof rawImage === "string") images.add(highResImage(rawImage));
      if (Array.isArray(rawImage)) for (const i of rawImage) if (typeof i === "string") images.add(highResImage(i));
      const offers = node.offers as Record<string, unknown> | Array<Record<string, unknown>> | undefined;
      if (offers && !Array.isArray(offers) && (typeof offers.price === "string" || typeof offers.price === "number")) {
        const p = Number(offers.price);
        if (Number.isFinite(p) && p > 0) jsonLdPrice = p;
      } else if (Array.isArray(offers)) {
        for (const o of offers) {
          const p = Number(o?.price);
          if (Number.isFinite(p) && p > 0) {
            jsonLdPrice = p;
            break;
          }
        }
      }
    }

    for (const m of html.matchAll(/"(?:hiRes|large|mainUrl)"\s*:\s*"([^"]+)"/gi)) {
      const raw = decodeHtml(String(m[1] || "").replace(/\\u0026/g, "&").replace(/\\\//g, "/"));
      const img = cleanText(raw);
      if (img && /^https?:\/\//i.test(img)) images.add(highResImage(img));
    }

    const title = cleanText(extractMeta(html, "og:title") || decodeHtml(stripHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "")));
    const description = cleanText(extractMeta(html, "description") || extractMeta(html, "og:description"));
    const bullets = extractBullets(html);
    const metaPriceRaw = extractMeta(html, "product:price:amount");
    const metaPrice = metaPriceRaw ? Number(metaPriceRaw.replace(",", ".")) : null;
    const snippetPrice = parsePriceLoose(`${description} ${bullets.join(" ")}`);
    const htmlPrice = parsePriceFromHtml(html);
    const price = (Number.isFinite(metaPrice || NaN) ? metaPrice : null) ?? jsonLdPrice ?? htmlPrice ?? snippetPrice ?? null;
    const sortedImages = Array.from(images).sort((a, b) => imageScore(b) - imageScore(a));
    const mirroredImages = await mirrorImagesToR2(sortedImages, `amazon/${asin.toLowerCase()}`, MAX_PRODUCT_IMAGES);

    const product: ScrapedProduct = {
      asin,
      url,
      title,
      description,
      bullets,
      images: mirroredImages.slice(0, MAX_PRODUCT_IMAGES),
      price,
    };
    await setCache(cacheKey, product, 14);
    return product;
  } catch (error) {
    await logStep(runId, "SCRAPE_PRODUCT", "WARN", { asin }, {}, error instanceof Error ? error.message : String(error));
    return null;
  }
}

type AiPayload = {
  title: string;
  excerpt: string;
  listingHighlights: string[];
  pros: string[];
  cons: string[];
  bestFor: string[];
  notFor: string[];
  bodyParagraphs: string[];
};

function normalizeForLineCompare(input: string) {
  return cleanText(input).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();
}

function pickListingHighlights(review: AiPayload, product: ScrapedProduct) {
  const sourceBullets = product.bullets.map(normalizeForLineCompare).filter(Boolean);
  const aiLines = Array.isArray(review.listingHighlights) ? review.listingHighlights : [];
  const cleanedAi = aiLines
    .map((x) => cleanText(x))
    .filter((x) => x.length >= 18)
    .filter((x) => !sourceBullets.includes(normalizeForLineCompare(x)));
  if (cleanedAi.length >= 3) return cleanedAi.slice(0, 6);
  const fallback = product.bullets
    .slice(0, 6)
    .map((x) => cleanText(x))
    .map((x) => (/[.!?]$/.test(x) ? `Highlights practical value: ${x}` : `Highlights practical value: ${x}.`));
  return fallback;
}

function parseOpenAiText(json: Record<string, unknown>) {
  const flat = String(json.output_text || "").trim();
  const output = Array.isArray(json.output) ? (json.output as Array<{ content?: Array<{ text?: string }> }>) : [];
  const nested = output.flatMap((o) => (Array.isArray(o.content) ? o.content : [])).map((c) => String(c.text || "")).join("\n").trim();
  return flat || nested;
}

async function generateAiReview(product: ScrapedProduct, categoryPath: string): Promise<{ parsed: AiPayload | null; usage: Record<string, unknown> | null; responseId: string | null }> {
  if (!process.env.OPENAI_API_KEY) return { parsed: null, usage: null, responseId: null };
  const prompt = `You are an affiliate review writer.
Return ONLY valid JSON.
Write practical, product-specific content.
Do not copy listing bullets verbatim.
Schema:
{
  "title": "string",
  "excerpt": "1-2 sentence summary",
  "listingHighlights": ["4-6 rewritten highlights; do NOT copy source bullets verbatim"],
  "pros": ["5 items"],
  "cons": ["3 items"],
  "bestFor": ["3 items"],
  "notFor": ["2 items"],
  "bodyParagraphs": ["3-5 short paragraphs"]
}`;

  const input = {
    category: categoryLabel(categoryPath),
    asin: product.asin,
    title: product.title,
    description: product.description,
    bullets: product.bullets,
  };

  const call = async (extra = "") => {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        input: `${extra}${prompt}\n\nINPUT_JSON:\n${JSON.stringify(input)}`,
        temperature: 0.35,
      }),
    });
    if (!response.ok) return { parsed: null, usage: null, responseId: null };
    const json = (await response.json()) as Record<string, unknown>;
    const text = parseOpenAiText(json);
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first < 0 || last <= first) {
      return {
        parsed: null,
        usage: (json.usage || null) as Record<string, unknown> | null,
        responseId: typeof json.id === "string" ? json.id : null,
      };
    }
    try {
      const parsed = JSON.parse(text.slice(first, last + 1)) as AiPayload;
      return {
        parsed,
        usage: (json.usage || null) as Record<string, unknown> | null,
        responseId: typeof json.id === "string" ? json.id : null,
      };
    } catch {
      return {
        parsed: null,
        usage: (json.usage || null) as Record<string, unknown> | null,
        responseId: typeof json.id === "string" ? json.id : null,
      };
    }
  };

  const first = await call("");
  if (first.parsed) return first;
  return call("IMPORTANT: RETURN STRICT JSON ONLY, NO MARKDOWN, NO EXTRA TEXT.\n");
}

async function uniqueSlug(base: string) {
  let slug = base.replace(/\/+/g, "/").replace(/^\/|\/$/g, "");
  let i = 2;
  while (true) {
    const found = await prisma.page.findUnique({ where: { slug }, select: { id: true } });
    if (!found) return slug;
    slug = `${base}-${i}`;
    i += 1;
    if (i > 200) return `${base}-${Date.now()}`;
  }
}

export async function runCleanAmazonPipeline(config: AutomationConfigLike, opts?: CleanPipelineOptions): Promise<PipelineResult> {
  const targetSet = new Set(opts?.targetCategoryPaths ?? []);
  const forceMaxItemsPerNiche = opts?.forceMaxItemsPerNiche;
  const maxTotalPosts = opts?.maxTotalPosts;
  const amazonTag =
    process.env.AMAZON_CREATOR_PARTNER_TAG ||
    process.env.AMAZON_PAAPI_PARTNER_TAG ||
    (await prisma.affiliateAccount.findFirst({
      where: { isActive: true, partner: { source: "AMAZON", isEnabled: true } },
      select: { trackingId: true },
      orderBy: { updatedAt: "desc" },
    }))?.trackingId ||
    null;
  const normalizedAmazonTag = String(amazonTag || "").trim();
  if (!normalizedAmazonTag) throw new Error("Amazon partner tag is required.");

  const allNiches = await prisma.automationNiche.findMany({
    where: { source: "AMAZON", isEnabled: true },
    orderBy: [{ priority: "asc" }, { updatedAt: "desc" }],
  });
  const niches = targetSet.size
    ? allNiches.filter((n) => targetSet.has(n.categoryPath))
    : allNiches;

  let requestedPosts = 0;
  let createdPages = 0;
  const updatedPages = 0;
  let generatedOffers = 0;
  let createdOffers = 0;
  let updatedOffers = 0;
  let skippedNoValidAmazon = 0;
  let nichesUsed = 0;
  let aiAttempts = 0;
  let aiFailures = 0;

  for (const niche of niches) {
    const postsForNiche = Math.max(1, Math.min(10, forceMaxItemsPerNiche ?? niche.maxItems));
    requestedPosts += postsForNiche;

    const existing = await prisma.product.findMany({
      where: { category: niche.categoryPath },
      select: { attributes: true },
      take: 1000,
    });
    const existingAsins = new Set(
      existing
        .map((x) => {
          const a = x.attributes as Record<string, unknown> | null;
          return a && typeof a.asin === "string" ? a.asin.toUpperCase() : "";
        })
        .filter(Boolean),
    );
    const cutoff = new Date(Date.now() - RECENT_TITLE_DUPLICATE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const recentPageTitles: RecentPageTitle[] = await prisma.page.findMany({
      where: {
        type: "REVIEW",
        createdAt: { gte: cutoff },
        OR: [
          { product: { category: niche.categoryPath } },
          { product: { category: { startsWith: `${niche.categoryPath}/` } } },
        ],
      },
      select: {
        id: true,
        slug: true,
        title: true,
      },
      orderBy: { createdAt: "desc" },
      take: 300,
    });

    const keyword = extractKeywordFromNicheInput(niche.keywords || niche.categoryPath);
    const found = new Map<string, SearchItem>();
    for (let page = 1; page <= 10; page += 1) {
      const pageItems = await scrapeSearchPage(keyword, page);
      for (const item of pageItems) {
        if (!found.has(item.asin) && !existingAsins.has(item.asin)) found.set(item.asin, item);
      }
      if (found.size >= postsForNiche) break;
      if (pageItems.length < 10) break;
    }

    const selected = Array.from(found.values()).slice(0, postsForNiche);
    await logStep(opts?.runId, "DISCOVERY_AMAZON_SCRAPE", "OK", { niche: niche.categoryPath, keyword }, { found: selected.length });
    if (selected.length === 0) {
      skippedNoValidAmazon += postsForNiche;
      continue;
    }

    let createdInNiche = 0;
    for (const item of selected) {
      const product = await scrapeProduct(item.asin, opts?.runId);
      if (!product) {
        skippedNoValidAmazon += 1;
        continue;
      }

      aiAttempts += 1;
      const ai = await generateAiReview(product, niche.categoryPath);
      if (!ai.parsed) {
        aiFailures += 1;
        await logStep(opts?.runId, "AI_REVIEW_REQUIRED", "ERROR", { asin: product.asin }, { ok: false }, "AI response missing/invalid");
        continue;
      }

      const review = ai.parsed;
      const title = cleanText(review.title || `${cleanText(product.title)} Review`);
      const duplicateTitlePage = recentPageTitles.find((p) => isLikelyDuplicateTitle(title, p.title));
      if (duplicateTitlePage) {
        await logStep(
          opts?.runId,
          "DEDUPE_TITLE_REPEAT",
          "WARN",
          { asin: product.asin, niche: niche.categoryPath, title },
          { existingPageId: duplicateTitlePage.id, existingSlug: duplicateTitlePage.slug, existingTitle: duplicateTitlePage.title },
          `Skipped repeated review title inside ${RECENT_TITLE_DUPLICATE_WINDOW_DAYS}-day window.`,
        );
        continue;
      }

      const productId = `clean_prod_${hash(`${niche.categoryPath}:${product.asin}`)}`;
      const dbProduct = await prisma.product.upsert({
        where: { id: productId },
        update: {
          canonicalName: cleanText(product.title),
          category: niche.categoryPath,
          attributes: { asin: product.asin, images: product.images.slice(0, MAX_PRODUCT_IMAGES) } as never,
        },
        create: {
          id: productId,
          canonicalName: cleanText(product.title),
          category: niche.categoryPath,
          attributes: { asin: product.asin, images: product.images.slice(0, MAX_PRODUCT_IMAGES) } as never,
        },
        select: { id: true },
      });

      const existingPage = await prisma.page.findFirst({
        where: { productId: dbProduct.id },
        select: { id: true, slug: true, status: true },
      });
      if (existingPage) {
        await logStep(
          opts?.runId,
          "DEDUPE_PAGE",
          "WARN",
          { asin: product.asin, productId: dbProduct.id },
          { existingPageId: existingPage.id, slug: existingPage.slug, status: existingPage.status },
          "Page already exists for product; skipped duplicate page creation.",
        );
        continue;
      }

      const offerUrl = `https://www.amazon.com/dp/${product.asin}?tag=${encodeURIComponent(normalizedAmazonTag)}`;
      const aff = validateAffiliateUrl("AMAZON", offerUrl, { amazonTrackingId: normalizedAmazonTag });
      if (!aff.ok) {
        aiFailures += 1;
        await logStep(opts?.runId, "AFFILIATE_VALIDATE", "ERROR", { asin: product.asin }, { url: offerUrl }, aff.reason);
        continue;
      }

      const ingest = await ingestOfferItems([
        {
          source: "AMAZON",
          externalId: `AMAZON_${product.asin}`,
          productId: dbProduct.id,
          title: cleanText(product.title),
          price: product.price,
          currency: "USD",
          affiliateUrl: offerUrl,
          imageUrl: product.images[0] || item.imageUrl || null,
          productName: cleanText(product.title),
          productCategory: niche.categoryPath,
          partnerName: "Amazon US",
          payload: {
            mode: "clean-pipeline-main-offer",
            asin: product.asin,
          } as never,
        },
      ]);
      generatedOffers += ingest.processed;
      createdOffers += ingest.createdOffers;
      updatedOffers += ingest.updatedOffers;

      const slug = await uniqueSlug(`${niche.categoryPath}/${toSlug(title)}`);
      const contentMd = [
        "## Listing Highlights",
        ...pickListingHighlights(review, product).map((x) => `- ${x}`),
        "",
        "## Pros",
        ...review.pros.slice(0, 5).map((x) => `- ${cleanText(x)}`),
        "",
        "## Cons",
        ...review.cons.slice(0, 3).map((x) => `- ${cleanText(x)}`),
        "",
        "## Best For",
        ...review.bestFor.slice(0, 3).map((x) => `- ${cleanText(x)}`),
        "",
        ...(Array.isArray(review.notFor) && review.notFor.length
          ? ["## Not For", ...review.notFor.slice(0, 2).map((x) => `- ${cleanText(x)}`), ""]
          : []),
        ...review.bodyParagraphs.slice(0, 5).map((x) => cleanText(x)),
      ].join("\n");

      const created = await prisma.page.create({
        data: {
          slug,
          productId: dbProduct.id,
          type: "REVIEW",
          title,
          excerpt: cleanText(review.excerpt || product.description || title).slice(0, 240),
          contentMd,
          heroImageUrl: product.images[0] || item.imageUrl || null,
          status: config.publishMode === "PUBLISHED" ? "PUBLISHED" : "DRAFT",
          publishedAt: config.publishMode === "PUBLISHED" ? new Date() : null,
        },
        select: { id: true },
      });

      await prisma.aiGenerationLog.create({
        data: {
          runId: opts?.runId ?? null,
          pageId: created.id,
          categoryPath: niche.categoryPath,
          keyword,
          productName: title,
          model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
          provider: "openai",
          usedAi: true,
          fallbackUsed: false,
          promptHash: hash(`${niche.categoryPath}:${product.asin}`),
          promptChars: JSON.stringify(product).length,
          outputChars: JSON.stringify(review).length,
          qualityScore: 80,
          errorMessage: null,
        },
      });
      await logStep(opts?.runId, "AI_USAGE", "OK", { asin: product.asin }, { responseId: ai.responseId, usage: ai.usage });
      recentPageTitles.unshift({ id: created.id, slug, title });

      createdPages += 1;
      createdInNiche += 1;
      if (maxTotalPosts != null && createdPages >= maxTotalPosts) {
        break;
      }
    }
    if (createdInNiche > 0) nichesUsed += 1;
    if (maxTotalPosts != null && createdPages >= maxTotalPosts) {
      break;
    }
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
    aiAttempts,
    aiFailures,
  };
}

export async function backcheckPublishedAmazonPrices(opts?: { runId?: string; limit?: number }) {
  const limit = Math.max(1, Math.min(2000, opts?.limit ?? 500));
  const offers = await prisma.offer.findMany({
    where: {
      source: "AMAZON",
      price: { not: null },
      product: {
        pages: {
          some: { status: "PUBLISHED" },
        },
      },
    },
    include: {
      product: true,
      partner: true,
    },
    take: limit,
    orderBy: { updatedAt: "asc" },
  });

  let scanned = 0;
  let updatedOffers = 0;
  let priceUpdates = 0;

  for (const offer of offers) {
    scanned += 1;
    const attrs = offer.product.attributes as Record<string, unknown> | null;
    const asin = attrs && typeof attrs.asin === "string" ? attrs.asin.toUpperCase() : "";
    if (!asin) continue;

    const scraped = await scrapeProduct(asin, opts?.runId);
    if (!scraped) continue;

    const ingested = await ingestOfferItems([
      {
        source: "AMAZON",
        externalId: offer.externalId || `AMAZON_${asin}`,
        productId: offer.productId,
        title: cleanText(scraped.title || offer.title || offer.product.canonicalName),
        price: scraped.price ?? (offer.price != null ? Number(offer.price) : null),
        currency: offer.currency || "USD",
        affiliateUrl: offer.affiliateUrl,
        imageUrl: scraped.images[0] || offer.imageUrl || null,
        productName: offer.product.canonicalName,
        productCategory: offer.product.category,
        partnerName: offer.partner?.name || "Amazon US",
        payload: {
          mode: "monthly-price-backcheck",
          asin,
        } as never,
      },
    ]);

    updatedOffers += ingested.updatedOffers;
    priceUpdates += ingested.priceUpdates;
  }

  await logStep(
    opts?.runId,
    "MONTHLY_PRICE_BACKCHECK",
    "OK",
    { limit },
    { scanned, updatedOffers, priceUpdates, offers: offers.length },
  );

  return {
    scanned,
    updatedOffers,
    priceUpdates,
  };
}

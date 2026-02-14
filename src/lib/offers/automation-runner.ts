import crypto from "node:crypto";
import { OfferSource, PageStatus, PageType, type AutomationConfig, type AutomationNiche } from "@prisma/client";
import { validateAffiliateUrl } from "@/lib/offers/affiliate-validation";
import { categoryLabel } from "@/lib/category-taxonomy";
import { searchGoogleCseBySource, type CseItem } from "@/lib/offers/cse-link-discovery";
import { ingestOfferItems, type OfferIngestItem } from "@/lib/offers/ingest";
import { prisma } from "@/lib/prisma";

type RunnerResult = {
  nichesUsed: number;
  requestedPosts: number;
  createdPages: number;
  updatedPages: number;
  generatedOffers: number;
  createdOffers: number;
  updatedOffers: number;
  skippedNoValidAmazon: number;
};

type SourceConfig = {
  source: OfferSource;
  partnerName: string;
  deepLinkPattern: string | null;
  trackingId: string | null;
};

const COMPETITOR_SOURCES: OfferSource[] = ["ALIEXPRESS", "TEMU", "ALIBABA", "EBAY"];

function slugify(input: string) {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function hashId(parts: string[]) {
  return crypto.createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 16);
}

function parseAmazonAsin(url: string): string | null {
  const m = url.match(/\/dp\/([A-Z0-9]{10})(?:[/?]|$)/i) || url.match(/\/gp\/product\/([A-Z0-9]{10})(?:[/?]|$)/i);
  return m?.[1]?.toUpperCase() ?? null;
}

function isValidAmazonItem(item: CseItem) {
  const link = item.link.toLowerCase();
  if (!link.includes("amazon.")) return false;
  return Boolean(parseAmazonAsin(item.link));
}

function normalizeProductTitle(raw: string) {
  return raw
    .replace(/\s*\|\s*Amazon.*$/i, "")
    .replace(/\s*-\s*Amazon.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function applyDeepLinkPattern(
  pattern: string | null | undefined,
  targetUrl: string,
  query: string,
  trackingId?: string | null,
) {
  if (!pattern) return targetUrl;
  return pattern
    .replaceAll("{url}", encodeURIComponent(targetUrl))
    .replaceAll("{query}", encodeURIComponent(query))
    .replaceAll("{trackingId}", encodeURIComponent(trackingId || ""))
    .replaceAll("{tag}", encodeURIComponent(trackingId || ""));
}

function withAmazonTag(urlString: string, trackingId: string | null) {
  if (!trackingId) return urlString;
  try {
    const u = new URL(urlString);
    u.searchParams.set("tag", trackingId);
    return u.toString();
  } catch {
    return urlString;
  }
}

function buildAffiliateUrl(cfg: SourceConfig, targetUrl: string, keyword: string) {
  if (cfg.source === "AMAZON") {
    const tagged = withAmazonTag(targetUrl, cfg.trackingId);
    return applyDeepLinkPattern(cfg.deepLinkPattern, tagged, keyword, cfg.trackingId);
  }
  return applyDeepLinkPattern(cfg.deepLinkPattern, targetUrl, keyword, cfg.trackingId);
}

function derivePrice(text: string | undefined): number | null {
  if (!text) return null;
  const m = text.match(/\$([0-9]{1,4}(?:[.,][0-9]{2})?)/);
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

async function upsertTags(pageId: string, categoryPath: string) {
  const tags = Array.from(new Set([...categoryPath.split("/").filter(Boolean), categoryPath, "automation", "review"]));
  for (const name of tags) {
    const tag = await prisma.tag.upsert({
      where: { name },
      update: {},
      create: { name },
      select: { id: true },
    });
    await prisma.pageTag.upsert({
      where: { pageId_tagId: { pageId, tagId: tag.id } },
      update: {},
      create: { pageId, tagId: tag.id },
    });
  }
}

async function rewriteArticle(opts: {
  aiRewriteEnabled: boolean;
  promptTemplate: string | null;
  nicheLabel: string;
  keyword: string;
  productName: string;
  snippets: string[];
}) {
  const fallback = [
    "## TL;DR",
    `${opts.productName} is a notable pick in ${opts.nicheLabel}.`,
    "",
    "## Why It Stands Out",
    ...opts.snippets.slice(0, 4).map((s) => `- ${s}`),
    "",
    "## What To Check Before Buying",
    "- Current price and shipping details",
    "- Warranty and return terms",
    "- Compatibility with your setup",
  ].join("\n");

  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const prompt = opts.promptTemplate?.trim()
    ? opts.promptTemplate
    : "Rewrite the source notes into a concise, factual buying guide in markdown.";
  const input = [
    prompt,
    `Niche: ${opts.nicheLabel}`,
    `Keyword: ${opts.keyword}`,
    `Product: ${opts.productName}`,
    "Source notes:",
    ...opts.snippets.slice(0, 8).map((s) => `- ${s}`),
    "Output format: markdown with headings and bullet lists.",
  ].join("\n");

  if (!opts.aiRewriteEnabled || !process.env.OPENAI_API_KEY) {
    return {
      content: fallback,
      usedAi: false,
      fallbackUsed: true,
      model,
      promptHash: hashId([input]),
      promptChars: input.length,
      outputChars: fallback.length,
      errorMessage: null as string | null,
    };
  }

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        input,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      return {
        content: fallback,
        usedAi: false,
        fallbackUsed: true,
        model,
        promptHash: hashId([input]),
        promptChars: input.length,
        outputChars: fallback.length,
        errorMessage: `OpenAI error ${response.status}`,
      };
    }

    const json = (await response.json()) as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };
    const flatText = String(json.output_text || "").trim();
    const nestedText =
      Array.isArray(json.output)
        ? json.output
            .flatMap((o) => (Array.isArray(o.content) ? o.content : []))
            .map((c) => String(c.text || ""))
            .join("\n")
            .trim()
        : "";
    const text = (flatText || nestedText).trim();
    const finalText = text.length >= 220 ? text : fallback;

    return {
      content: finalText,
      usedAi: text.length >= 220,
      fallbackUsed: text.length < 220,
      model,
      promptHash: hashId([input]),
      promptChars: input.length,
      outputChars: finalText.length,
      errorMessage: null as string | null,
    };
  } catch (error) {
    return {
      content: fallback,
      usedAi: false,
      fallbackUsed: true,
      model,
      promptHash: hashId([input]),
      promptChars: input.length,
      outputChars: fallback.length,
      errorMessage: error instanceof Error ? error.message.slice(0, 500) : "Unknown OpenAI error",
    };
  }
}

function buildComparisonSection(rows: Array<{ partner: string; source: OfferSource; price: string; url: string }>) {
  if (!rows.length) return "## Offer Comparison\nNo comparable partner offers were found for this run.";
  const header = "| Partner | Source | Price | Link |\n|---|---|---:|---|";
  const lines = rows.map((r) => `| ${r.partner} | ${r.source} | ${r.price} | [Open offer](${r.url}) |`);
  return ["## Offer Comparison", header, ...lines].join("\n");
}

async function sourceConfig(source: OfferSource): Promise<SourceConfig> {
  const [partner, account] = await Promise.all([
    prisma.partner.findFirst({ where: { source, isEnabled: true }, orderBy: { createdAt: "asc" }, select: { name: true } }),
    prisma.affiliateAccount.findFirst({
      where: { isActive: true, partner: { source, isEnabled: true } },
      orderBy: { updatedAt: "desc" },
      select: { deepLinkPattern: true, trackingId: true },
    }),
  ]);

  return {
    source,
    partnerName: partner?.name || source,
    deepLinkPattern: account?.deepLinkPattern ?? null,
    trackingId:
      account?.trackingId ??
      (source === "AMAZON" ? process.env.AMAZON_CREATOR_PARTNER_TAG || process.env.AMAZON_PAAPI_PARTNER_TAG || null : null),
  };
}

async function collectAmazonCandidates(niche: AutomationNiche, target: number) {
  const queries = [niche.keywords, `${niche.keywords} review`, `${niche.keywords} best`];
  const seen = new Set<string>();
  const candidates: CseItem[] = [];

  for (const q of queries) {
    if (candidates.length >= target) break;
    const results = await searchGoogleCseBySource("AMAZON", q, 10);
    for (const item of results) {
      if (candidates.length >= target) break;
      if (!isValidAmazonItem(item)) continue;
      if (seen.has(item.link)) continue;
      seen.add(item.link);
      candidates.push(item);
    }
  }
  return candidates;
}

async function collectCompetitors(keyword: string, productName: string) {
  const query = `${productName} ${keyword}`.trim();
  const all: Array<{ source: OfferSource; item: CseItem }> = [];

  for (const source of COMPETITOR_SOURCES) {
    const items = await searchGoogleCseBySource(source, query, 3);
    for (const item of items) {
      all.push({ source, item });
    }
  }

  return all;
}

export async function runAutomationPipeline(config: AutomationConfig, opts?: { runId?: string }): Promise<RunnerResult> {
  const niches = await prisma.automationNiche.findMany({
    where: { source: config.source, isEnabled: true },
    orderBy: [{ priority: "asc" }, { updatedAt: "desc" }],
  });

  const primaryCfg = await sourceConfig("AMAZON");
  if (!primaryCfg.deepLinkPattern && !primaryCfg.trackingId) {
    throw new Error("Amazon affiliate account is not configured. Add active account with deep link pattern or tracking id.");
  }

  const sourceCfg = new Map<OfferSource, SourceConfig>();
  sourceCfg.set("AMAZON", primaryCfg);
  for (const src of COMPETITOR_SOURCES) {
    sourceCfg.set(src, await sourceConfig(src));
  }

  let nichesUsed = 0;
  let requestedPosts = 0;
  let createdPages = 0;
  let updatedPages = 0;
  let generatedOffers = 0;
  let createdOffers = 0;
  let updatedOffers = 0;
  let skippedNoValidAmazon = 0;

  for (const niche of niches) {
    const targetPosts = Math.max(1, Math.min(10, niche.maxItems));
    requestedPosts += targetPosts;
    const candidates = await collectAmazonCandidates(niche, targetPosts);
    if (candidates.length === 0) {
      skippedNoValidAmazon += targetPosts;
      continue;
    }
    nichesUsed += 1;

    for (const candidate of candidates.slice(0, targetPosts)) {
      const asin = parseAmazonAsin(candidate.link);
      if (!asin) {
        skippedNoValidAmazon += 1;
        continue;
      }

      const productName = normalizeProductTitle(candidate.title) || niche.keywords;
      const categoryPath = niche.categoryPath;

      const product = await prisma.product.upsert({
        where: { id: `prod_${hashId([categoryPath, productName])}` },
        update: { canonicalName: productName, category: categoryPath },
        create: { id: `prod_${hashId([categoryPath, productName])}`, canonicalName: productName, category: categoryPath },
        select: { id: true },
      });

      const pageSlug = `${categoryPath}/${slugify(productName)}-${asin.toLowerCase()}`;
      const existingPage = await prisma.page.findUnique({ where: { slug: pageSlug }, select: { id: true } });

      const competitors = await collectCompetitors(niche.keywords, productName);
      const competitorOffers: OfferIngestItem[] = competitors.flatMap(({ source, item }) => {
        const cfg = sourceCfg.get(source)!;
        if (!cfg.deepLinkPattern) return [];
        const title = normalizeProductTitle(item.title) || productName;
        const ext = `${source}_${hashId([source, item.link, pageSlug])}`;
        return [{
          source,
          externalId: ext,
          productId: product.id,
          title,
          price: derivePrice(item.snippet),
          currency: "USD",
          affiliateUrl: buildAffiliateUrl(cfg, item.link, niche.keywords),
          imageUrl: item.imageUrl || null,
          productName,
          productCategory: categoryPath,
          partnerName: cfg.partnerName,
          payload: { mode: "competitor-cse", nicheCategory: categoryPath, keyword: niche.keywords, cse: item },
        }];
      });

      const amazonOffer: OfferIngestItem = {
        source: "AMAZON",
        externalId: `AMAZON_${asin}_${hashId([candidate.link, pageSlug])}`,
        productId: product.id,
        title: productName,
        price: derivePrice(candidate.snippet),
        currency: "USD",
        affiliateUrl: buildAffiliateUrl(primaryCfg, candidate.link, niche.keywords),
        imageUrl: candidate.imageUrl || null,
        productName,
        productCategory: categoryPath,
        partnerName: primaryCfg.partnerName,
        payload: { mode: "amazon-cse-primary", nicheCategory: categoryPath, keyword: niche.keywords, cse: candidate },
      };

      const affiliateCheckPrimary = validateAffiliateUrl("AMAZON", amazonOffer.affiliateUrl, { amazonTrackingId: primaryCfg.trackingId });
      if (!affiliateCheckPrimary.ok) {
        throw new Error(`Affiliate validation failed for Amazon offer: ${affiliateCheckPrimary.reason}`);
      }
      const safeCompetitors = competitorOffers.filter((co) => validateAffiliateUrl(co.source, co.affiliateUrl).ok);
      const ingest = await ingestOfferItems([amazonOffer, ...safeCompetitors]);
      generatedOffers += ingest.processed;
      createdOffers += ingest.createdOffers;
      updatedOffers += ingest.updatedOffers;
      if (ingest.processed === 0) continue;

      const offerRows = await prisma.offer.findMany({
        where: { productId: product.id },
        include: { partner: true },
        orderBy: [{ updatedAt: "desc" }],
      });

      const compareRows = offerRows.map((o) => ({
        partner: o.partner?.name || o.source,
        source: o.source,
        price: o.price ? `${o.price.toString()} ${o.currency}` : "N/A",
        url: `/go/${o.id}?ref=article-table`,
      }));

      const rewritten = await rewriteArticle({
        aiRewriteEnabled: config.aiRewriteEnabled,
        promptTemplate: config.promptTemplate,
        nicheLabel: categoryLabel(categoryPath),
        keyword: niche.keywords,
        productName,
        snippets: [candidate.snippet, ...competitors.map((c) => c.item.snippet)].filter((v): v is string => Boolean(v)),
      });
      const contentMd = `${rewritten.content}\n\n${buildComparisonSection(compareRows)}`;

      const page = existingPage
        ? await prisma.page.update({
            where: { id: existingPage.id },
            data: {
              productId: product.id,
              type: PageType.REVIEW,
              title: `${productName} - ${categoryLabel(categoryPath)} Buying Guide`,
              excerpt: `Compared offers for ${productName} in ${categoryLabel(categoryPath)}.`,
              contentMd,
              heroImageUrl: candidate.imageUrl || null,
              status: config.publishMode === "PUBLISHED" ? PageStatus.PUBLISHED : PageStatus.DRAFT,
              publishedAt: config.publishMode === "PUBLISHED" ? new Date() : null,
            },
            select: { id: true },
          })
        : await prisma.page.create({
            data: {
              slug: pageSlug,
              productId: product.id,
              type: PageType.REVIEW,
              title: `${productName} - ${categoryLabel(categoryPath)} Buying Guide`,
              excerpt: `Compared offers for ${productName} in ${categoryLabel(categoryPath)}.`,
              contentMd,
              heroImageUrl: candidate.imageUrl || null,
              status: config.publishMode === "PUBLISHED" ? PageStatus.PUBLISHED : PageStatus.DRAFT,
              publishedAt: config.publishMode === "PUBLISHED" ? new Date() : null,
            },
            select: { id: true },
          });

      if (existingPage) updatedPages += 1;
      else createdPages += 1;

      await upsertTags(page.id, categoryPath);

      const qualityScore = Math.max(
        10,
        Math.min(
          100,
          Math.round(
            (rewritten.usedAi ? 45 : 20) +
              Math.min(30, rewritten.outputChars / 120) +
              Math.min(25, compareRows.length * 5),
          ),
        ),
      );

      await prisma.aiGenerationLog.create({
        data: {
          runId: opts?.runId ?? null,
          pageId: page.id,
          categoryPath,
          keyword: niche.keywords,
          productName,
          model: rewritten.model,
          provider: "openai",
          usedAi: rewritten.usedAi,
          fallbackUsed: rewritten.fallbackUsed,
          promptHash: rewritten.promptHash,
          promptChars: rewritten.promptChars,
          outputChars: rewritten.outputChars,
          qualityScore,
          errorMessage: rewritten.errorMessage,
        },
      });

      await prisma.automationPatternSignal.create({
        data: {
          source: config.source,
          categoryPath,
          keyword: niche.keywords,
          productName,
          amazonQuery: `${niche.keywords} review`,
          competitorQueries: {
            base: `${productName} ${niche.keywords}`,
            sources: COMPETITOR_SOURCES,
          },
          competitorsFound: competitors.length,
          validOffersCount: compareRows.length,
          aiUsed: rewritten.usedAi,
          qualityScore,
        },
      });

      if (config.publishMode === "PUBLISHED" && compareRows.length === 0) {
        throw new Error(`Publish blocked: ${productName} has no valid affiliate offers.`);
      }
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
  };
}

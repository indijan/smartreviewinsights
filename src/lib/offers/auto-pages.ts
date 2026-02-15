import { categoryLabel } from "@/lib/category-taxonomy";
import type { OfferSource } from "@/lib/offer-source";
import { prisma } from "@/lib/prisma";

export type AutoPageResult = {
  processed: number;
  created: number;
  updated: number;
};

function sourceLabel(source: OfferSource) {
  switch (source) {
    case "AMAZON":
      return "Amazon";
    case "ALIEXPRESS":
      return "AliExpress";
    case "TEMU":
      return "Temu";
    case "ALIBABA":
      return "Alibaba";
    case "EBAY":
      return "eBay";
    default:
      return source;
  }
}

function slugForSourceCategory(source: OfferSource, categoryPath: string) {
  return `offers/${source.toLowerCase()}/${categoryPath}`;
}

function buildContent(source: OfferSource, categoryPath: string, offers: Array<{ title: string | null; affiliateUrl: string; productName: string }>) {
  const heading = `${categoryLabel(categoryPath)} ${sourceLabel(source)} Picks`;
  const lines = offers.slice(0, 10).map((offer) => {
    const title = offer.title || offer.productName;
    return `- [${title}](${offer.affiliateUrl})`;
  });

  return [
    `## TL;DR`,
    `${heading} collected from active partner links.`,
    "",
    "## Quick Picks",
    ...lines,
    "",
    "## Notes",
    "Prices and stock may change on partner pages.",
  ].join("\n");
}

async function upsertTag(name: string) {
  return prisma.tag.upsert({
    where: { name },
    update: {},
    create: { name },
    select: { id: true },
  });
}

export async function generateOfferLandingPagesForSource(opts: {
  source: OfferSource;
  publishMode: "DRAFT" | "PUBLISHED";
  maxPages?: number;
}) {
  const maxPages = Math.max(1, Math.min(100, opts.maxPages ?? 20));

  const niches = await prisma.automationNiche.findMany({
    where: { source: opts.source, isEnabled: true },
    orderBy: [{ priority: "asc" }, { updatedAt: "desc" }],
    take: maxPages,
  });

  let processed = 0;
  let created = 0;
  let updated = 0;

  for (const niche of niches) {
    const offers = await prisma.offer.findMany({
      where: {
        source: opts.source,
        product: { category: niche.categoryPath },
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 12,
      select: {
        title: true,
        affiliateUrl: true,
        product: { select: { canonicalName: true } },
      },
    });

    if (offers.length === 0) continue;

    processed += 1;

    const slug = slugForSourceCategory(opts.source, niche.categoryPath);
    const title = `${categoryLabel(niche.categoryPath)} ${sourceLabel(opts.source)} Deals`;
    const contentMd = buildContent(
      opts.source,
      niche.categoryPath,
      offers.map((o) => ({ title: o.title, affiliateUrl: o.affiliateUrl, productName: o.product.canonicalName }))
    );

    const existing = await prisma.page.findUnique({ where: { slug }, select: { id: true } });

    const page = existing
      ? await prisma.page.update({
          where: { id: existing.id },
          data: {
            title,
            excerpt: `Updated ${sourceLabel(opts.source)} picks for ${categoryLabel(niche.categoryPath)}.`,
            contentMd,
            type: "LANDING",
            status: opts.publishMode === "PUBLISHED" ? "PUBLISHED" : "DRAFT",
            publishedAt: opts.publishMode === "PUBLISHED" ? new Date() : null,
          },
          select: { id: true },
        })
      : await prisma.page.create({
          data: {
            slug,
            title,
            excerpt: `Updated ${sourceLabel(opts.source)} picks for ${categoryLabel(niche.categoryPath)}.`,
            contentMd,
            type: "LANDING",
            status: opts.publishMode === "PUBLISHED" ? "PUBLISHED" : "DRAFT",
            publishedAt: opts.publishMode === "PUBLISHED" ? new Date() : null,
          },
          select: { id: true },
        });

    if (existing) updated += 1;
    else created += 1;

    const tags = Array.from(new Set([...niche.categoryPath.split("/").filter(Boolean), niche.categoryPath, opts.source.toLowerCase()]));
    for (const tagName of tags) {
      const tag = await upsertTag(tagName);
      await prisma.pageTag.upsert({
        where: { pageId_tagId: { pageId: page.id, tagId: tag.id } },
        update: {},
        create: { pageId: page.id, tagId: tag.id },
      });
    }
  }

  return { processed, created, updated } satisfies AutoPageResult;
}

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { OfferSource, PageType, PrismaClient } from "@prisma/client";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

const prisma = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString })) });

function cleanKeywords(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 8)
    .join(" ");
}

function affiliateTagFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const tag = parsed.searchParams.get("tag");
    return tag || null;
  } catch {
    return null;
  }
}

async function resolveAffiliateTag(): Promise<string> {
  if (process.env.AMAZON_ASSOC_TAG) {
    return process.env.AMAZON_ASSOC_TAG;
  }

  const sample = await prisma.offer.findFirst({
    where: { source: OfferSource.AMAZON },
    orderBy: { createdAt: "desc" },
    select: { affiliateUrl: true },
  });

  const inferred = sample ? affiliateTagFromUrl(sample.affiliateUrl) : null;
  if (!inferred) {
    throw new Error("Cannot infer Amazon tag. Set AMAZON_ASSOC_TAG in .env");
  }
  return inferred;
}

function searchAffiliateUrl(query: string, tag: string): string {
  const q = encodeURIComponent(query);
  return `https://www.amazon.com/s?k=${q}&tag=${encodeURIComponent(tag)}`;
}

async function main() {
  const dryRun = !process.argv.includes("--apply");
  const tag = await resolveAffiliateTag();
  const skipSlugs = new Set(["authors", "contact", "home-2"]);

  const pages = await prisma.page.findMany({
    where: {
      status: "PUBLISHED",
      productId: null,
      type: {
        in: [PageType.ARTICLE, PageType.REVIEW],
      },
    },
    orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      slug: true,
      title: true,
    },
  });

  let processed = 0;

  for (const page of pages) {
    if (skipSlugs.has(page.slug)) {
      continue;
    }

    const query = cleanKeywords(page.title) || page.slug.replace(/-/g, " ");
    const url = searchAffiliateUrl(query, tag);

    if (dryRun) {
      console.log(`[DRY] ${page.slug} -> ${url}`);
      processed += 1;
      continue;
    }

    const product = await prisma.product.create({
      data: {
        canonicalName: page.title.slice(0, 180),
        category: "fallback",
      },
      select: { id: true },
    });

    await prisma.offer.create({
      data: {
        productId: product.id,
        source: OfferSource.AMAZON,
        title: `${page.title} (Amazon search)`.slice(0, 255),
        affiliateUrl: url,
        lastUpdated: new Date(),
      },
    });

    await prisma.page.update({
      where: { id: page.id },
      data: { productId: product.id },
    });

    console.log(`[APPLY] ${page.slug} -> ${url}`);
    processed += 1;
  }

  console.log(`Processed missing pages: ${processed}`);
  if (dryRun) {
    console.log("Dry run only. Add --apply to persist fallback offers.");
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

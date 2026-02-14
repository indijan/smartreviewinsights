import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { OfferSource, PageType, PrismaClient } from "@prisma/client";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

const prisma = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString })) });

const TARGET_SLUGS = new Set([
  "a-kutyak-borapolasa-es-a-leggyakoribb-borproblemak",
  "a-legjobb-vitaminok-es-etrendkiegeszitok-kutyaknak",
  "forro-nyari-napok-es-a-hoguta-veszelyei-kutyaknal",
  "hogyan-segitheted-kutyad-regeneralodasat-mutet-utan",
  "mit-arul-el-a-kutyad-viselkedese-az-egeszsegerol",
]);

const SLUG_TO_QUERY: Record<string, string> = {
  "a-kutyak-borapolasa-es-a-leggyakoribb-borproblemak":
    "dog skin care allergy shampoo omega 3 for dogs",
  "a-legjobb-vitaminok-es-etrendkiegeszitok-kutyaknak":
    "dog vitamins supplements multivitamin probiotic glucosamine",
  "forro-nyari-napok-es-a-hoguta-veszelyei-kutyaknal":
    "dog cooling mat cooling vest portable pet water bottle",
  "hogyan-segitheted-kutyad-regeneralodasat-mutet-utan":
    "dog recovery suit cone e-collar wound care supplement",
  "mit-arul-el-a-kutyad-viselkedese-az-egeszsegerol":
    "dog behavior training aid anxiety relief calming treats",
};

function affiliateTagFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get("tag");
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
  return `https://www.amazon.com/s?k=${encodeURIComponent(query)}&tag=${encodeURIComponent(tag)}`;
}

async function main() {
  const dryRun = !process.argv.includes("--apply");
  const tag = await resolveAffiliateTag();

  const pages = await prisma.page.findMany({
    where: {
      productId: null,
      type: PageType.ARTICLE,
      slug: { in: [...TARGET_SLUGS] },
    },
    select: {
      id: true,
      slug: true,
      title: true,
    },
    orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
  });

  let processed = 0;

  for (const page of pages) {
    const query = SLUG_TO_QUERY[page.slug] ?? "dog health products";
    const url = searchAffiliateUrl(query, tag);

    if (dryRun) {
      console.log(`[DRY] ${page.slug} -> ${url}`);
      processed += 1;
      continue;
    }

    const product = await prisma.product.create({
      data: {
        canonicalName: `${page.title} (HU fallback)`.slice(0, 180),
        category: "dog-health",
        attributes: {
          fallbackType: "hu-keyword-mapping",
          sourceSlug: page.slug,
          query,
        },
      },
      select: { id: true },
    });

    await prisma.offer.create({
      data: {
        productId: product.id,
        source: OfferSource.AMAZON,
        title: `${page.title} (Amazon search HU fallback)`.slice(0, 255),
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

  console.log(`Processed HU fallback pages: ${processed}`);
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

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { OfferSource, PrismaClient } from "@prisma/client";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

const prisma = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString })) });

function extractAmazonUrl(markdown: string): string | null {
  const match = markdown.match(/https?:\/\/(?:www\.)?amazon\.[^\s)\]]+/i);
  return match?.[0] ?? null;
}

async function main() {
  const dryRun = !process.argv.includes("--apply");
  const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : 200;

  const pages = await prisma.page.findMany({
    where: {
      status: "PUBLISHED",
      productId: null,
    },
    orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
    take: Number.isFinite(limit) ? limit : 200,
    select: { id: true, slug: true, title: true, contentMd: true },
  });

  let candidates = 0;
  let linked = 0;

  for (const page of pages) {
    const amazonUrl = extractAmazonUrl(page.contentMd);
    if (!amazonUrl) continue;
    candidates += 1;

    const canonicalName = page.title.slice(0, 180);

    if (dryRun) {
      console.log(`[DRY] ${page.slug} -> ${amazonUrl}`);
      continue;
    }

    const product = await prisma.product.create({
      data: {
        canonicalName,
        category: "unassigned",
      },
      select: { id: true },
    });

    const offer = await prisma.offer.create({
      data: {
        productId: product.id,
        source: OfferSource.AMAZON,
        title: `${canonicalName} (Amazon)`.slice(0, 255),
        affiliateUrl: amazonUrl,
        lastUpdated: new Date(),
      },
      select: { id: true },
    });

    await prisma.page.update({
      where: { id: page.id },
      data: { productId: product.id },
    });

    linked += 1;
    console.log(`[LINKED] ${page.slug} -> product ${product.id} -> offer ${offer.id}`);
  }

  console.log(`Checked pages: ${pages.length}`);
  console.log(`Amazon candidates: ${candidates}`);
  if (dryRun) {
    console.log("No DB write in dry-run mode. Use --apply to persist links.");
  } else {
    console.log(`Linked pages: ${linked}`);
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

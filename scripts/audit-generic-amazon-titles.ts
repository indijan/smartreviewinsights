import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg(new Pool({ connectionString })),
});

function isGenericAmazonTitle(value: string | null | undefined) {
  const normalized = String(value || "").trim().toLowerCase();
  return !normalized || normalized === "amazon.com" || normalized === "amazon.com:";
}

async function main() {
  const pages = await prisma.page.findMany({
    where: {
      type: "REVIEW",
      status: "PUBLISHED",
    },
    include: {
      product: {
        include: {
          offers: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 1000,
  });

  const suspicious = pages
    .filter((page) => {
      const genericProduct = isGenericAmazonTitle(page.product?.canonicalName);
      const genericOffer = (page.product?.offers || []).some((offer) => isGenericAmazonTitle(offer.title));
      return genericProduct || genericOffer;
    })
    .map((page) => ({
      id: page.id,
      slug: page.slug,
      title: page.title,
      productName: page.product?.canonicalName ?? null,
      offerTitles: (page.product?.offers || []).map((offer) => offer.title),
      offerUrls: (page.product?.offers || []).map((offer) => offer.affiliateUrl),
      createdAt: page.createdAt.toISOString(),
    }));

  console.log(JSON.stringify(suspicious, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { OfferSource, PageStatus, PageType, PrismaClient } from "@prisma/client";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

const adapter = new PrismaPg(new Pool({ connectionString }));
const prisma = new PrismaClient({ adapter });

async function main() {
  const product = await prisma.product.create({
    data: {
      canonicalName: "Acme Smart Watch X2",
      category: "smart-watch",
      attributes: {
        batteryLife: "7 days",
        waterproof: "5 ATM",
        display: "AMOLED",
      },
      offers: {
        create: {
          source: OfferSource.AMAZON,
          title: "Acme Smart Watch X2 on Amazon",
          price: 149.99,
          currency: "USD",
          affiliateUrl: "https://www.amazon.com/dp/B0EXAMPLE?tag=smartreviewinsights-20",
          lastUpdated: new Date(),
        },
      },
    },
  });

  await prisma.page.createMany({
    data: [
      {
        slug: "best-smart-watch-2026",
        type: PageType.REVIEW,
        title: "Best Smart Watch 2026",
        excerpt: "Top pick, budget pick, and alternatives with affiliate-ready blocks.",
        contentMd:
          "## TL;DR\n- Good for: people who want battery life and health tracking.\n- Not good for: users who need full LTE calling.\n\n## Top pick\nAcme Smart Watch X2 has strong battery and readable display.\n\n## Pros\n- Long battery life\n- Bright AMOLED display\n\n## Cons\n- No LTE variant\n\n## FAQ\n### Is this waterproof?\nYes, rated 5 ATM.",
        status: PageStatus.PUBLISHED,
        publishedAt: new Date(),
        productId: product.id,
      },
      {
        slug: "category/smart-watch",
        type: PageType.CATEGORY,
        title: "Smart Watch Category",
        excerpt: "Category landing for smart watch content.",
        contentMd: "# Smart Watch\nExplore reviews and comparisons.",
        status: PageStatus.PUBLISHED,
        publishedAt: new Date(),
      },
    ],
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

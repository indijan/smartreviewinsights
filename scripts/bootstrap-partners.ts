import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { OfferSource, PrismaClient } from "@prisma/client";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const prisma = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString })) });

async function main() {
  const partners = [
    {
      name: "Amazon US",
      source: OfferSource.AMAZON,
      websiteUrl: "https://www.amazon.com",
      hasApi: true,
      notes: "Primary source. Prefer PA-API for price/availability validation.",
      accountLabel: "Amazon main account",
      trackingId: process.env.AMAZON_ASSOC_TAG || "indijanmac-20",
      deepLinkPattern: "https://www.amazon.com/s?k={query}&tag={trackingId}",
    },
    {
      name: "AliExpress",
      source: OfferSource.ALIEXPRESS,
      websiteUrl: "https://www.aliexpress.com",
      hasApi: true,
      notes: "Explore API partner options; fallback via curated affiliate deep links.",
      accountLabel: "AliExpress main account",
      trackingId: process.env.ALIEXPRESS_TRACKING_ID || null,
      deepLinkPattern: process.env.ALIEXPRESS_DEEPLINK_PATTERN || null,
    },
    {
      name: "Temu",
      source: OfferSource.TEMU,
      websiteUrl: "https://www.temu.com",
      hasApi: false,
      notes: "No stable public API; use managed affiliate link workflows and manual QA.",
      accountLabel: "Temu main account",
      trackingId: process.env.TEMU_TRACKING_ID || null,
      deepLinkPattern: process.env.TEMU_DEEPLINK_PATTERN || null,
    },
    {
      name: "Alibaba",
      source: OfferSource.ALIBABA,
      websiteUrl: "https://www.alibaba.com",
      hasApi: false,
      notes: "No direct product API path in this stack; consider affiliate search/deeplink strategy.",
      accountLabel: "Alibaba main account",
      trackingId: process.env.ALIBABA_TRACKING_ID || null,
      deepLinkPattern: process.env.ALIBABA_DEEPLINK_PATTERN || null,
    },
  ];

  for (const p of partners) {
    const partner = await prisma.partner.upsert({
      where: {
        name_source: {
          name: p.name,
          source: p.source,
        },
      },
      update: {
        websiteUrl: p.websiteUrl,
        hasApi: p.hasApi,
        notes: p.notes,
      },
      create: {
        name: p.name,
        source: p.source,
        websiteUrl: p.websiteUrl,
        hasApi: p.hasApi,
        notes: p.notes,
      },
    });

    await prisma.affiliateAccount.upsert({
      where: {
        id: `${partner.id}-main`,
      },
      update: {
        label: p.accountLabel,
        trackingId: p.trackingId,
        deepLinkPattern: p.deepLinkPattern,
        isActive: true,
      },
      create: {
        id: `${partner.id}-main`,
        partnerId: partner.id,
        label: p.accountLabel,
        trackingId: p.trackingId,
        deepLinkPattern: p.deepLinkPattern,
        isActive: true,
      },
    });

    console.log(`Upserted partner: ${p.name}`);
  }
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

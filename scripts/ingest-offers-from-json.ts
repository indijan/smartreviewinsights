import "dotenv/config";
import fs from "node:fs/promises";
import { OfferSource } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { ingestOfferItems, type OfferIngestItem } from "../src/lib/offers/ingest";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const prisma = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString })) });

function isOfferSource(v: string): v is OfferSource {
  return ["AMAZON", "ALIBABA", "ALIEXPRESS", "TEMU", "EBAY"].includes(v);
}

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("Usage: tsx scripts/ingest-offers-from-json.ts <file.json>");

  const raw = JSON.parse(await fs.readFile(file, "utf8")) as { items?: Array<Record<string, unknown>> };
  if (!raw.items || !Array.isArray(raw.items)) throw new Error("JSON must contain items[]");

  const items: OfferIngestItem[] = raw.items.map((row) => {
    const source = String(row.source || "").toUpperCase();
    if (!isOfferSource(source)) throw new Error(`Invalid source: ${source}`);

    return {
      source,
      externalId: String(row.externalId || ""),
      affiliateUrl: String(row.affiliateUrl || ""),
      productName: String(row.productName || ""),
      title: row.title ? String(row.title) : undefined,
      price: typeof row.price === "number" ? row.price : null,
      currency: row.currency ? String(row.currency) : "USD",
      imageUrl: row.imageUrl ? String(row.imageUrl) : null,
      availability: row.availability ? String(row.availability) : null,
      productCategory: row.productCategory ? String(row.productCategory) : null,
      pageSlug: row.pageSlug ? String(row.pageSlug) : null,
      partnerName: row.partnerName ? String(row.partnerName) : null,
      payload: row,
    };
  });

  const result = await ingestOfferItems(items);
  console.log(result);
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

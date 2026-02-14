import "dotenv/config";
import fs from "node:fs/promises";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

const prisma = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString })) });

function extractUrls(markdown: string): string[] {
  return [...markdown.matchAll(/https?:\/\/[^\s)\]]+/gi)].map((m) => m[0]);
}

function isAmazonUrl(url: string): boolean {
  return /https?:\/\/(?:www\.)?amazon\./i.test(url) || /https?:\/\/amzn\.to\//i.test(url);
}

function csvEscape(value: string): string {
  const escaped = value.replace(/"/g, '""');
  return `"${escaped}"`;
}

async function main() {
  const pages = await prisma.page.findMany({
    where: {
      status: "PUBLISHED",
      productId: null,
    },
    orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      slug: true,
      title: true,
      contentMd: true,
    },
  });

  const rows: string[] = ["slug,title,reason,url_count,example_url"];

  for (const page of pages) {
    const urls = extractUrls(page.contentMd);
    const amazon = urls.find(isAmazonUrl);

    let reason = "";
    let example = "";
    if (amazon) {
      reason = "has_amazon_but_not_linked";
      example = amazon;
    } else if (urls.length > 0) {
      reason = "has_links_but_no_amazon";
      example = urls[0] ?? "";
    } else if (!page.contentMd.trim()) {
      reason = "empty_content";
    } else {
      reason = "no_links_in_content";
    }

    rows.push(
      [
        csvEscape(page.slug),
        csvEscape(page.title),
        csvEscape(reason),
        String(urls.length),
        csvEscape(example),
      ].join(",")
    );
  }

  const out = "missing-product-pages.csv";
  await fs.writeFile(out, rows.join("\n") + "\n", "utf8");
  console.log(`Missing product pages: ${pages.length}`);
  console.log(`Written: ${out}`);
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

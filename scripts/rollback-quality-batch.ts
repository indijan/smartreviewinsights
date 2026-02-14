import "dotenv/config";
import fs from "node:fs/promises";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import TurndownService from "turndown";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const prisma = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString })) });
const turndown = new TurndownService();

function extractTag(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
  return (match?.[1] ?? "").trim();
}

function decodeCdata(input: string): string {
  return input.replace(/^<!\[CDATA\[|\]\]>$/g, "");
}

function normalizeSlug(input: string): string {
  return input.trim().replace(/^\/+|\/+$/g, "");
}

async function main() {
  const xmlPath = process.argv[2] || "./wordpress-export.xml";
  const xml = await fs.readFile(xmlPath, "utf8");
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];

  const xmlBySlug = new Map<string, { title: string; excerpt: string | null; contentMd: string }>();

  for (const item of items) {
    const wpPostType = decodeCdata(extractTag(item, "wp:post_type"));
    if (wpPostType !== "post" && wpPostType !== "page") continue;

    const slug = normalizeSlug(decodeCdata(extractTag(item, "wp:post_name")));
    if (!slug) continue;

    const title = decodeCdata(extractTag(item, "title"));
    const excerpt = decodeCdata(extractTag(item, "excerpt:encoded")) || null;
    const encodedContent = decodeCdata(extractTag(item, "content:encoded"));
    const contentMd = turndown.turndown(encodedContent || "");

    xmlBySlug.set(slug, { title, excerpt, contentMd });
  }

  const affected = await prisma.page.findMany({
    where: {
      status: "PUBLISHED",
      contentMd: { contains: "## Recommendation" },
    },
    select: { id: true, slug: true },
    take: 200,
  });

  let restored = 0;
  let missing = 0;

  for (const page of affected) {
    const source = xmlBySlug.get(page.slug);
    if (!source) {
      missing += 1;
      continue;
    }

    await prisma.page.update({
      where: { id: page.id },
      data: {
        title: source.title,
        excerpt: source.excerpt,
        contentMd: source.contentMd,
      },
    });
    restored += 1;
    console.log(`[RESTORED] ${page.slug}`);
  }

  console.log(`Candidates: ${affected.length}`);
  console.log(`Restored from XML: ${restored}`);
  console.log(`Missing in XML: ${missing}`);
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

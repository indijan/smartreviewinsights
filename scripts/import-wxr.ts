import "dotenv/config";
import fs from "node:fs/promises";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, PageStatus, PageType } from "@prisma/client";
import { Pool } from "pg";
import TurndownService from "turndown";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}
const prisma = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString })) });
const turndown = new TurndownService();

function extractTag(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
  return (match?.[1] ?? "").trim();
}

function decodeCdata(input: string): string {
  return input.replace(/^<!\[CDATA\[|\]\]>$/g, "");
}

function toPageType(wpPostType: string): PageType {
  if (wpPostType === "page") return PageType.LANDING;
  return PageType.ARTICLE;
}

function normalizeSlug(input: string): string {
  return input.trim().replace(/^\/+|\/+$/g, "");
}

function extractTerms(itemXml: string): string[] {
  const terms = new Set<string>();
  const categoryMatches = itemXml.matchAll(
    /<category([^>]*)>([\s\S]*?)<\/category>/g
  );

  for (const match of categoryMatches) {
    const attrs = match[1] ?? "";
    const body = decodeCdata((match[2] ?? "").trim());
    const domainMatch = attrs.match(/domain="([^"]+)"/);
    const nicenameMatch = attrs.match(/nicename="([^"]+)"/);
    const domain = domainMatch?.[1] ?? "";

    if (domain !== "category" && domain !== "post_tag") {
      continue;
    }

    const raw = nicenameMatch?.[1] || body;
    const value = normalizeSlug(raw.toLowerCase().replace(/\s+/g, "-"));
    if (value) {
      terms.add(value);
    }
  }

  return [...terms];
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    throw new Error("Usage: tsx scripts/import-wxr.ts <path-to-wordpress-export.xml>");
  }

  const xml = await fs.readFile(file, "utf8");
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  let importedPages = 0;
  let importedTags = 0;
  let linkedTags = 0;

  for (const item of items) {
    const title = decodeCdata(extractTag(item, "title"));
    const encodedContent = decodeCdata(extractTag(item, "content:encoded"));
    const excerpt = decodeCdata(extractTag(item, "excerpt:encoded")) || null;
    const slug = normalizeSlug(decodeCdata(extractTag(item, "wp:post_name")));
    const status = decodeCdata(extractTag(item, "wp:status"));
    const wpPostType = decodeCdata(extractTag(item, "wp:post_type"));
    const postDate = decodeCdata(extractTag(item, "wp:post_date_gmt"));
    const terms = extractTerms(item);

    if (!slug || !title) continue;
    if (wpPostType !== "post" && wpPostType !== "page") continue;

    const contentMd = turndown.turndown(encodedContent || "");

    const page = await prisma.page.upsert({
      where: { slug },
      update: {
        title,
        excerpt,
        contentMd,
        type: toPageType(wpPostType),
        status: status === "publish" ? PageStatus.PUBLISHED : PageStatus.DRAFT,
        publishedAt: postDate ? new Date(postDate) : null,
      },
      create: {
        slug,
        title,
        excerpt,
        contentMd,
        type: toPageType(wpPostType),
        status: status === "publish" ? PageStatus.PUBLISHED : PageStatus.DRAFT,
        publishedAt: postDate ? new Date(postDate) : null,
      },
    });
    importedPages += 1;

    for (const term of terms) {
      const tag = await prisma.tag.upsert({
        where: { name: term },
        update: {},
        create: { name: term },
      });
      importedTags += 1;

      await prisma.pageTag.upsert({
        where: {
          pageId_tagId: {
            pageId: page.id,
            tagId: tag.id,
          },
        },
        update: {},
        create: {
          pageId: page.id,
          tagId: tag.id,
        },
      });
      linkedTags += 1;
    }
  }

  console.log(
    `Processed ${items.length} XML items. Upserted pages: ${importedPages}, terms processed: ${importedTags}, page-term links: ${linkedTags}.`
  );
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

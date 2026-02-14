import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

const prisma = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString })) });

function normalizeSlug(input: string): string {
  return input.trim().replace(/^\/+|\/+$/g, "").toLowerCase();
}

function slugFromUrlOrPath(line: string): string {
  const value = line.trim();
  if (!value) return "";

  try {
    const u = new URL(value);
    return normalizeSlug(u.pathname);
  } catch {
    return normalizeSlug(value.split(/[?#]/)[0] ?? "");
  }
}

function decodeCdata(input: string): string {
  return input.replace(/^<!\[CDATA\[|\]\]>$/g, "");
}

function extractTag(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
  return (match?.[1] ?? "").trim();
}

function slugsFromWxr(xml: string): string[] {
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  const slugs = new Set<string>();

  for (const item of items) {
    const wpPostType = decodeCdata(extractTag(item, "wp:post_type"));
    if (wpPostType !== "post" && wpPostType !== "page") continue;

    const raw = decodeCdata(extractTag(item, "wp:post_name"));
    const slug = normalizeSlug(raw);
    if (slug) slugs.add(slug);
  }

  return [...slugs];
}

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    throw new Error(
      "Usage: tsx scripts/slug-audit.ts <wordpress-export.xml|urls.txt|urls.csv>"
    );
  }

  const raw = await fs.readFile(inputPath, "utf8");
  const ext = path.extname(inputPath).toLowerCase();

  const candidateSlugs =
    ext === ".xml"
      ? slugsFromWxr(raw)
      : [...new Set(raw.split(/\r?\n/).map(slugFromUrlOrPath).filter(Boolean))];

  const existingPages = await prisma.page.findMany({
    select: { slug: true },
  });
  const existingSet = new Set(existingPages.map((p) => normalizeSlug(p.slug)));

  const missing = candidateSlugs.filter((slug) => !existingSet.has(slug));
  const present = candidateSlugs.length - missing.length;

  console.log(`Input slugs: ${candidateSlugs.length}`);
  console.log(`Present in DB: ${present}`);
  console.log(`Missing in DB: ${missing.length}`);

  if (missing.length > 0) {
    const outFile = "slug-audit-missing.txt";
    await fs.writeFile(outFile, missing.join("\n") + "\n", "utf8");
    console.log(`Missing slug list written to ${outFile}`);
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

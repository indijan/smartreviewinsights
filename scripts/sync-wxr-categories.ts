import "dotenv/config";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import { Client } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

function extractTag(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
  return (match?.[1] ?? "").trim();
}

function decodeCdata(input: string): string {
  return input.replace(/^<!\[CDATA\[|\]\]>$/g, "");
}

function normalizeSlug(input: string): string {
  return input.trim().replace(/^\/+|\/+$/g, "").toLowerCase();
}

function extractCategories(itemXml: string): string[] {
  const categories = new Set<string>();
  const matches = itemXml.matchAll(/<category([^>]*)>([\s\S]*?)<\/category>/g);

  for (const match of matches) {
    const attrs = match[1] ?? "";
    const domain = (attrs.match(/domain="([^"]+)"/) || [])[1] || "";
    if (domain !== "category") continue;

    const nicename = (attrs.match(/nicename="([^"]+)"/) || [])[1] || "";
    const body = decodeCdata((match[2] ?? "").trim());
    const raw = nicename || body;
    const slug = normalizeSlug(raw.replace(/\s+/g, "-"));

    if (!slug || slug === "uncategorized") continue;
    categories.add(slug);
  }

  return [...categories];
}

function makeId() {
  return `wxr_${crypto.randomUUID().replace(/-/g, "")}`;
}

async function main() {
  const file = process.argv[2] || "./wordpress-export.xml";
  const xml = await fs.readFile(file, "utf8");
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];

  const client = new Client({ connectionString });
  await client.connect();
  const pageRows = await client.query<{ id: string; slug: string }>('SELECT id, slug FROM "Page"');
  const pageBySlug = new Map(pageRows.rows.map((r) => [r.slug, r.id]));

  const tagRows = await client.query<{ id: string; name: string }>('SELECT id, name FROM "Tag"');
  const tagByName = new Map(tagRows.rows.map((r) => [r.name, r.id]));

  let pagesMatched = 0;
  let tagsTouched = 0;
  let linksCreated = 0;

  for (const item of items) {
    const wpType = decodeCdata(extractTag(item, "wp:post_type"));
    if (wpType !== "post" && wpType !== "page") continue;

    const slug = normalizeSlug(decodeCdata(extractTag(item, "wp:post_name")));
    if (!slug) continue;

    const categories = extractCategories(item);
    if (categories.length === 0) continue;

    const pageId = pageBySlug.get(slug);
    if (!pageId) continue;
    pagesMatched += 1;

    for (const category of categories) {
      let tagId = tagByName.get(category);
      if (!tagId) {
        const created = await client.query<{ id: string }>('INSERT INTO "Tag" (id, name) VALUES ($1, $2) RETURNING id', [
          makeId(),
          category,
        ]);
        tagId = created.rows[0].id;
        tagByName.set(category, tagId);
      }
      tagsTouched += 1;

      const linkRes = await client.query(
        'INSERT INTO "PageTag" ("pageId", "tagId") VALUES ($1, $2) ON CONFLICT ("pageId", "tagId") DO NOTHING',
        [pageId, tagId]
      );

      if ((linkRes.rowCount ?? 0) > 0) linksCreated += 1;
    }
  }

  await client.end();

  console.log({ items: items.length, pagesMatched, tagsTouched, linksCreated });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

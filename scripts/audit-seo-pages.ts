import { prisma } from "@/lib/prisma";

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function normalizeText(input: string | null | undefined) {
  return String(input || "").replace(/\s+/g, " ").trim();
}

function titleFlags(title: string) {
  const flags: string[] = [];
  if (title.length < 35) flags.push("title_too_short");
  if (title.length > 70) flags.push("title_too_long");
  if (/amazon\.com[: ]/i.test(title)) flags.push("generic_amazon_title");
  if(/ - .*Buying Guide$/i.test(title)) flags.push("old_buying_guide_pattern");
  if (!/review|deals|guide|best|vs|compare|worth it/i.test(title)) flags.push("weak_intent_keyword");
  return flags;
}

function excerptFlags(excerpt: string) {
  const flags: string[] = [];
  if (!excerpt) flags.push("missing_excerpt");
  if (excerpt && excerpt.length < 110) flags.push("excerpt_too_short");
  if (excerpt.length > 180) flags.push("excerpt_too_long");
  if (/^compared offers for /i.test(excerpt)) flags.push("generic_excerpt_pattern");
  if (/^\s*$/.test(excerpt)) flags.push("blank_excerpt");
  return flags;
}

async function main() {
  const pages = await prisma.page.findMany({
    where: {
      status: "PUBLISHED",
      OR: [{ type: "REVIEW" }, { type: "LANDING" }, { type: "ARTICLE" }],
    },
    orderBy: { updatedAt: "desc" },
    select: {
      slug: true,
      type: true,
      title: true,
      excerpt: true,
      updatedAt: true,
    },
  });

  const rows = [
    ["slug", "type", "title_length", "excerpt_length", "flags", "title", "excerpt", "updated_at"].join(","),
  ];

  for (const page of pages) {
    const title = normalizeText(page.title);
    const excerpt = normalizeText(page.excerpt);
    const flags = [...titleFlags(title), ...excerptFlags(excerpt)];
    if (flags.length === 0) continue;

    rows.push([
      csvEscape(page.slug),
      csvEscape(page.type),
      csvEscape(title.length),
      csvEscape(excerpt.length),
      csvEscape(flags.join("|")),
      csvEscape(title),
      csvEscape(excerpt),
      csvEscape(page.updatedAt.toISOString()),
    ].join(","));
  }

  const out = "tmp-seo-audit.csv";
  await import("node:fs/promises").then((fs) => fs.writeFile(out, rows.join("\n"), "utf8"));
  console.log(out);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

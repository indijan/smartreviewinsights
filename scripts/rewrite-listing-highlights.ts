import { prisma } from "@/lib/prisma";

type AiOut = { listingHighlights: string[] };

function cleanText(input: string) {
  return String(input || "").replace(/\s+/g, " ").trim();
}

function normalizeForCompare(input: string) {
  return cleanText(input)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseArgs() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const limitArg = args.find((x) => x.startsWith("--limit="));
  const limit = Math.max(1, Math.min(5000, Number(limitArg?.split("=")[1] || "300") || 300));
  return { apply, limit };
}

function extractListingHighlights(contentMd: string) {
  const match = contentMd.match(/##\s*Listing Highlights\s*\n([\s\S]*?)(?=\n##\s|$)/i);
  if (!match) return { section: null as string | null, bullets: [] as string[] };
  const section = match[0];
  const body = match[1] || "";
  const bullets = body
    .split("\n")
    .map((x) => x.trim())
    .filter((x) => x.startsWith("- "))
    .map((x) => cleanText(x.replace(/^-+\s*/, "")))
    .filter(Boolean);
  return { section, bullets };
}

function replaceListingHighlights(contentMd: string, lines: string[]) {
  const newSection = ["## Listing Highlights", ...lines.map((x) => `- ${cleanText(x)}`), ""].join("\n");
  if (/##\s*Listing Highlights\s*\n/i.test(contentMd)) {
    return contentMd.replace(/##\s*Listing Highlights\s*\n[\s\S]*?(?=\n##\s|$)/i, newSection.trimEnd());
  }
  return `${newSection}\n${contentMd}`;
}

function fallbackParaphrase(lines: string[]) {
  return lines
    .slice(0, 6)
    .map((x) => cleanText(x))
    .map((x) => {
      if (!x) return "";
      if (/[.!?]$/.test(x)) return `Practical takeaway: ${x}`;
      return `Practical takeaway: ${x}.`;
    })
    .filter(Boolean);
}

async function aiRewriteListingHighlights(params: {
  title: string;
  excerpt: string;
  category: string;
  sourceBullets: string[];
}) {
  if (!process.env.OPENAI_API_KEY) return null;
  const prompt = `You rewrite product listing highlights for an affiliate review article.
Return JSON only: {"listingHighlights":["..."]}.
Rules:
- 4 to 6 bullet lines.
- Practical buyer-focused wording.
- Do NOT copy source bullets verbatim.
- Keep statements concise.

Input:
${JSON.stringify(params)}`;

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      input: prompt,
      temperature: 0.25,
    }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as Record<string, unknown>;
  const text = (() => {
    const flat = String(data.output_text || "").trim();
    if (flat) return flat;
    const output = Array.isArray(data.output) ? (data.output as Array<{ content?: Array<{ text?: string }> }>) : [];
    return output
      .flatMap((o) => (Array.isArray(o.content) ? o.content : []))
      .map((c) => String(c.text || ""))
      .join("\n")
      .trim();
  })();
  const s = text.indexOf("{");
  const e = text.lastIndexOf("}");
  if (s < 0 || e <= s) return null;
  try {
    const parsed = JSON.parse(text.slice(s, e + 1)) as AiOut;
    if (!Array.isArray(parsed.listingHighlights)) return null;
    return parsed.listingHighlights.map((x) => cleanText(String(x))).filter(Boolean).slice(0, 6);
  } catch {
    return null;
  }
}

async function main() {
  const { apply, limit } = parseArgs();
  const pages = await prisma.page.findMany({
    where: { type: "REVIEW" },
    select: {
      id: true,
      slug: true,
      title: true,
      excerpt: true,
      contentMd: true,
      product: { select: { category: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });

  let scanned = 0;
  let updated = 0;
  let skippedNoSection = 0;
  let skippedNoBullets = 0;
  let aiUsed = 0;
  let fallbackUsed = 0;

  for (const page of pages) {
    scanned += 1;
    const { section, bullets } = extractListingHighlights(page.contentMd || "");
    if (!section) {
      skippedNoSection += 1;
      continue;
    }
    if (!bullets.length) {
      skippedNoBullets += 1;
      continue;
    }

    const aiLines = await aiRewriteListingHighlights({
      title: page.title,
      excerpt: page.excerpt || "",
      category: page.product?.category || "",
      sourceBullets: bullets,
    });
    let nextLines = aiLines && aiLines.length ? aiLines : fallbackParaphrase(bullets);
    if (aiLines && aiLines.length) aiUsed += 1;
    else fallbackUsed += 1;

    const sourceNorm = new Set(bullets.map(normalizeForCompare));
    nextLines = nextLines.filter((x) => !sourceNorm.has(normalizeForCompare(x)));
    if (!nextLines.length) nextLines = fallbackParaphrase(bullets);

    const nextContent = replaceListingHighlights(page.contentMd || "", nextLines.slice(0, 6));
    if (nextContent === page.contentMd) continue;

    if (apply) {
      await prisma.page.update({
        where: { id: page.id },
        data: { contentMd: nextContent },
      });
    }
    updated += 1;
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        mode: apply ? "apply" : "dry-run",
        scanned,
        updated,
        skippedNoSection,
        skippedNoBullets,
        aiUsed,
        fallbackUsed,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

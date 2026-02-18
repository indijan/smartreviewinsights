import { prisma } from "@/lib/prisma";

function cleanupHtmlNoise(input: string) {
  let text = String(input || "");

  const before = text;

  // Remove embedded CSS/JS blocks entirely.
  text = text.replace(/<style[\s\S]*?<\/style>/gi, "");
  text = text.replace(/<script[\s\S]*?<\/script>/gi, "");

  // Remove known legacy CSS blobs dumped into markdown/plain text.
  text = text
    .replace(/\.Product_Image,\.Product_Pros,[\s\S]*?@media only screen and \(max-width:768px\)\{[\s\S]*?\}\s*/gi, "")
    .replace(/\.container_roundup\s+ul\s+li:before\{[\s\S]*?\}\s*/gi, "")
    .replace(/\.stars-rating,\.stars-rating-main\{[\s\S]*?\}\s*/gi, "")
    .replace(/\.stars-rating\{[\s\S]*?@media only screen and \(max-width:768px\)\{[\s\S]*?\}\s*/gi, "");

  // Remove generic noisy CSS-rule runs when they appear as raw text (5+ rules in sequence).
  text = text.replace(
    /(?:^|\n)\s*(?:@[a-z-]+\s+[^{]+\{[\s\S]*?\}\s*|(?:[.#][a-z0-9_-]+(?:\s*,\s*[.#][a-z0-9_-]+){0,6}\s*\{[^{}]{0,1200}\}\s*)){5,}/gim,
    "\n",
  );

  // Same as above, but for markdown-escaped selectors like `.Product\_Rating{...}`.
  text = text.replace(
    /(?:^|\n)\s*(?:(?:@[a-z-]+\s+[^{]+\{[\s\S]*?\}\s*)|(?:[.#][a-z0-9_\\-]+(?:\s*,\s*[.#][a-z0-9_\\-]+){0,8}\s*\{[^{}]{0,2000}\}\s*)){4,}/gim,
    "\n",
  );

  // Keep button text but remove button wrapper.
  text = text.replace(/<button\b[^>]*>([\s\S]*?)<\/button>/gi, "$1");

  // Keep only href/target/rel on links, drop styling/event attrs.
  text = text.replace(/<a\b([^>]*)>/gi, (_m, attrs: string) => {
    const href = attrs.match(/\bhref\s*=\s*(".*?"|'.*?'|[^\s>]+)/i)?.[1];
    const target = attrs.match(/\btarget\s*=\s*(".*?"|'.*?'|[^\s>]+)/i)?.[1];
    const rel = attrs.match(/\brel\s*=\s*(".*?"|'.*?'|[^\s>]+)/i)?.[1];
    const out = [`<a`];
    if (href) out.push(` href=${href}`);
    if (target) out.push(` target=${target}`);
    if (rel) out.push(` rel=${rel}`);
    out.push(">");
    return out.join("");
  });

  // Remove inline styles and noisy presentational attrs from all tags.
  text = text
    .replace(/\sstyle\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, "")
    .replace(/\sclass\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, "")
    .replace(/\sid\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, "")
    .replace(/\sdata-[a-z0-9_-]+\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, "")
    .replace(/\son[a-z]+\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, "");

  // Normalize excessive empty lines introduced by stripping.
  text = text.replace(/^\s*\}\s*[\r\n]*/g, "");
  text = text.replace(/^\s*\{\s*[\r\n]*/g, "");
  text = text.replace(/\n{3,}/g, "\n\n").trim();

  return { changed: text !== before, content: text };
}

async function main() {
  const pages = await prisma.page.findMany({
    select: { id: true, slug: true, contentMd: true },
    take: 50000,
  });

  let updated = 0;
  const touched: string[] = [];

  for (const page of pages) {
    const cleaned = cleanupHtmlNoise(page.contentMd || "");
    if (!cleaned.changed) continue;
    await prisma.page.update({
      where: { id: page.id },
      data: { contentMd: cleaned.content },
    });
    updated += 1;
    if (touched.length < 50) touched.push(page.slug);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        totalPages: pages.length,
        updatedPages: updated,
        sampleSlugs: touched,
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

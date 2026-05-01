import { buildDealsExcerpt, buildDealsTitle, buildReviewExcerpt, buildReviewTitle } from "@/lib/seo-copy";
import { prisma } from "@/lib/prisma";

function parseArgs() {
  const args = new Set(process.argv.slice(2));
  return {
    apply: args.has("--apply"),
    limit: Number(process.argv.find((arg) => arg.startsWith("--limit="))?.split("=")[1] ?? "100"),
  };
}

function normalizeText(input: string | null | undefined) {
  return String(input || "").replace(/\s+/g, " ").trim();
}

function inferCategoryPathFromSlug(slug: string) {
  const parts = slug.split("/").filter(Boolean);
  if (parts[0] === "offers" && parts.length >= 3) {
    return parts.slice(2).join("/");
  }
  if (parts.length >= 2) {
    return parts.slice(0, -1).join("/");
  }
  return parts[0] || "";
}

function inferSourceLabelFromSlug(slug: string) {
  const source = slug.split("/")[1] || "";
  switch (source.toLowerCase()) {
    case "amazon":
      return "Amazon";
    case "aliexpress":
      return "AliExpress";
    case "alibaba":
      return "Alibaba";
    case "temu":
      return "Temu";
    case "ebay":
      return "eBay";
    default:
      return source || "Partner";
  }
}

function isWeakReviewTitle(title: string) {
  return (
    / - .*Buying Guide$/i.test(title) ||
    /^.+\sReview$/i.test(title) ||
    title.length < 40 ||
    title.length > 72 ||
    !/review|worth it|vs|best|guide/i.test(title)
  );
}

function isWeakReviewExcerpt(excerpt: string) {
  return (
    !excerpt ||
    /^Compared offers for /i.test(excerpt) ||
    excerpt.length < 110 ||
    excerpt.length > 180
  );
}

function isWeakLandingTitle(title: string) {
  return / deals$/i.test(title) && !/^Best /i.test(title);
}

function isWeakLandingExcerpt(excerpt: string) {
  return !excerpt || /^Updated .* picks for /i.test(excerpt) || excerpt.length < 90;
}

function isUsableProductName(name: string) {
  if (!name) return false;
  if (name.length < 12) return false;
  if (!/\s/.test(name)) return false;
  if (/^(apple|sony|samsung|amazon|ecobee|beats|meta)$/i.test(name)) return false;
  return true;
}

async function main() {
  const { apply, limit } = parseArgs();
  const pages = await prisma.page.findMany({
    where: {
      OR: [
        { type: "REVIEW", status: "PUBLISHED" },
        { type: "LANDING" },
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: Math.max(1, Math.min(5000, limit)),
    select: {
      id: true,
      slug: true,
      type: true,
      title: true,
      excerpt: true,
      product: {
        select: {
          canonicalName: true,
          category: true,
        },
      },
    },
  });

  const updates: Array<{
    id: string;
    slug: string;
    type: string;
    fromTitle: string;
    toTitle: string;
    fromExcerpt: string | null;
    toExcerpt: string;
  }> = [];

  for (const page of pages) {
    const currentTitle = normalizeText(page.title);
    const currentExcerpt = normalizeText(page.excerpt);
    const categoryPath = page.product?.category || inferCategoryPathFromSlug(page.slug);

    if (page.type === "REVIEW") {
      const productName = normalizeText(page.product?.canonicalName || "");
      if (!productName || !categoryPath || !isUsableProductName(productName)) continue;
      if (/amazon\.com[: ]/i.test(productName)) continue;

      const nextTitle = isWeakReviewTitle(currentTitle) ? buildReviewTitle(productName, categoryPath) : currentTitle;
      const nextExcerpt = isWeakReviewExcerpt(currentExcerpt)
        ? buildReviewExcerpt({
            productName,
            categoryPath,
            sourceText: null,
          })
        : currentExcerpt;

      if (nextTitle !== currentTitle || nextExcerpt !== currentExcerpt) {
        updates.push({
          id: page.id,
          slug: page.slug,
          type: page.type,
          fromTitle: currentTitle,
          toTitle: nextTitle,
          fromExcerpt: page.excerpt,
          toExcerpt: nextExcerpt,
        });
      }
    }

    if (page.type === "LANDING") {
      if (!page.slug.startsWith("offers/")) continue;
      const sourceLabel = inferSourceLabelFromSlug(page.slug);
      if (!categoryPath) continue;
      const nextTitle = isWeakLandingTitle(currentTitle) ? buildDealsTitle(categoryPath, sourceLabel) : currentTitle;
      const nextExcerpt = isWeakLandingExcerpt(currentExcerpt) ? buildDealsExcerpt(categoryPath, sourceLabel) : currentExcerpt;

      if (nextTitle !== currentTitle || nextExcerpt !== currentExcerpt) {
        updates.push({
          id: page.id,
          slug: page.slug,
          type: page.type,
          fromTitle: currentTitle,
          toTitle: nextTitle,
          fromExcerpt: page.excerpt,
          toExcerpt: nextExcerpt,
        });
      }
    }
  }

  console.log(JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    scanned: pages.length,
    updates: updates.length,
    sample: updates.slice(0, 20),
  }, null, 2));

  if (!apply) {
    return;
  }

  for (const item of updates) {
    await prisma.page.update({
      where: { id: item.id },
      data: {
        title: item.toTitle,
        excerpt: item.toExcerpt,
      },
    });
  }

  console.log(JSON.stringify({ applied: updates.length }, null, 2));
}

main().catch(async (error) => {
  console.error(error);
  process.exit(1);
});

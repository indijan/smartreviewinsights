import { prisma } from "@/lib/prisma";
import { mirrorImagesToR2 } from "@/lib/r2-media";

const MAX_PRODUCT_IMAGES = 4;

function isHotlink(url: string, publicBase: string) {
  const u = String(url || "").trim();
  if (!u) return false;
  if (u.startsWith(publicBase)) return false;
  return /amazon\./i.test(u) || /m\.media-amazon\.com/i.test(u);
}

async function main() {
  const publicBase = String(process.env.R2_PUBLIC_BASE_URL || "").replace(/\/+$/, "");
  if (!publicBase) throw new Error("R2_PUBLIC_BASE_URL is required");

  const pages = await prisma.page.findMany({
    where: { type: "REVIEW" },
    select: {
      id: true,
      slug: true,
      heroImageUrl: true,
      productId: true,
      product: { select: { id: true, attributes: true } },
    },
    take: 50000,
  });

  let productsUpdated = 0;
  let pagesUpdated = 0;
  let scanned = 0;

  for (const page of pages) {
    scanned += 1;
    const attrs = (page.product?.attributes || {}) as Record<string, unknown>;
    const currentImages = Array.isArray(attrs.images) ? attrs.images.filter((x): x is string => typeof x === "string") : [];
    const hotImages = currentImages.filter((x) => isHotlink(x, publicBase));
    const heroHot = page.heroImageUrl ? isHotlink(page.heroImageUrl, publicBase) : false;

    if (!hotImages.length && !heroHot) continue;

    const seedImages = Array.from(new Set([page.heroImageUrl || "", ...currentImages].filter(Boolean)));
    const keyPrefix = `migrate/${page.productId || page.id}`;
    const mirrored = await mirrorImagesToR2(seedImages, keyPrefix, MAX_PRODUCT_IMAGES);
    const nextImages = mirrored.slice(0, MAX_PRODUCT_IMAGES);
    const nextHero = nextImages[0] || page.heroImageUrl || null;

    if (page.productId && page.product) {
      const nextAttrs = { ...attrs, images: nextImages };
      if (JSON.stringify(nextAttrs) !== JSON.stringify(attrs)) {
        await prisma.product.update({
          where: { id: page.product.id },
          data: { attributes: nextAttrs as never },
        });
        productsUpdated += 1;
      }
    }

    if (nextHero !== page.heroImageUrl) {
      await prisma.page.update({
        where: { id: page.id },
        data: { heroImageUrl: nextHero },
      });
      pagesUpdated += 1;
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        scanned,
        productsUpdated,
        pagesUpdated,
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


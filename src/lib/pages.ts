import { categoryDescendantLeafSlugs } from "@/lib/category-taxonomy";
import { prisma } from "@/lib/prisma";
import { normalizeSlug } from "@/lib/slug";

const PAGE_WITH_OFFERS_INCLUDE = {
  product: {
    include: {
      offers: {
        where: {
          OR: [{ partnerId: null }, { partner: { isEnabled: true } }],
        },
        orderBy: { updatedAt: "desc" as const },
        include: { partner: true },
      },
    },
  },
  tags: { include: { tag: true } },
};

export async function getPageBySlug(rawSlug: string) {
  const slug = normalizeSlug(rawSlug);
  if (!slug) return null;

  return prisma.page.findUnique({
    where: { slug },
    include: PAGE_WITH_OFFERS_INCLUDE,
  });
}

export async function getPageById(id: string) {
  return prisma.page.findUnique({
    where: { id },
    include: PAGE_WITH_OFFERS_INCLUDE,
  });
}

export async function resolvePublishedPageBySlug(rawSlug: string) {
  const slug = normalizeSlug(rawSlug);
  if (!slug) return { page: null as Awaited<ReturnType<typeof getPageBySlug>> | null, canonicalRedirectSlug: null as string | null };

  const exact = await prisma.page.findUnique({
    where: { slug },
    include: PAGE_WITH_OFFERS_INCLUDE,
  });
  if (exact && exact.status === "PUBLISHED") return { page: exact, canonicalRedirectSlug: null };

  const altSlugs = new Set<string>();
  if (slug.startsWith("offers/amazon/")) {
    altSlugs.add(slug.replace(/^offers\/amazon\//, ""));
  } else {
    altSlugs.add(`offers/amazon/${slug}`);
  }

  const alt = await prisma.page.findFirst({
    where: {
      slug: { in: Array.from(altSlugs) },
      status: "PUBLISHED",
    },
    include: PAGE_WITH_OFFERS_INCLUDE,
  });

  if (!alt) return { page: null, canonicalRedirectSlug: null };
  if (alt.slug === slug) return { page: alt, canonicalRedirectSlug: null };
  return { page: alt, canonicalRedirectSlug: alt.slug };
}

export async function getContextualOffersForPage(page: {
  id: string;
  slug: string;
  productId: string | null;
  tags: Array<{ tag: { name: string } }>;
}) {
  if (page.productId) {
    return prisma.offer.findMany({
      where: {
        productId: page.productId,
        OR: [{ partnerId: null }, { partner: { isEnabled: true } }],
      },
      include: { partner: true },
      orderBy: [{ updatedAt: "desc" }],
      take: 12,
    });
  }

  const tagNames = page.tags.map((t) => t.tag.name);
  const categoryTag =
    tagNames.find((t) => t.includes("/")) ||
    page.slug.split("/").slice(0, 2).join("/") ||
    tagNames[0] ||
    "";
  if (!categoryTag) return [];

  return prisma.offer.findMany({
    where: {
      OR: [{ partnerId: null }, { partner: { isEnabled: true } }],
      AND: [
        {
      OR: [
        { product: { category: categoryTag } },
        { product: { category: { startsWith: `${categoryTag}/` } } },
      ],
        },
      ],
    },
    include: { partner: true },
    orderBy: [{ updatedAt: "desc" }],
    take: 12,
  });
}

export async function getLatestPages(page = 1, limit = 50) {
  const safePage = Math.max(1, page);
  const safeLimit = Math.max(1, Math.min(100, limit));
  const where = {
    status: "PUBLISHED",
    publishedAt: { not: null },
  };

  const [items, total] = await Promise.all([
    prisma.page.findMany({
      where: where as never,
      orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
      select: {
        id: true,
        slug: true,
        title: true,
        excerpt: true,
        type: true,
        publishedAt: true,
        heroImageUrl: true,
      },
    }),
    prisma.page.count({ where: where as never }),
  ]);

  return {
    items,
    total,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.max(1, Math.ceil(total / safeLimit)),
  };
}

export async function getRelatedReviewPages(args: {
  pageId: string;
  category?: string | null;
  slugPrefix?: string | null;
  title?: string | null;
  tagNames?: string[];
  limit?: number;
}) {
  const limit = Math.max(1, Math.min(12, args.limit ?? 4));
  if (!args.category) return [];

  return prisma.page.findMany({
    where: {
      id: { not: args.pageId },
      status: "PUBLISHED",
      type: { not: "CATEGORY" },
      OR: [
        { product: { category: args.category } },
        { product: { category: { startsWith: `${args.category}/` } } },
      ],
    },
    orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
    take: limit,
    select: {
      id: true,
      slug: true,
      title: true,
      excerpt: true,
      heroImageUrl: true,
    },
  });
}

export async function getCategoryPages(slugParts: string[], page = 1, limit = 30) {
  const categoryPath = normalizeSlug(slugParts.join("/"));
  const parts = categoryPath.split("/").filter(Boolean);
  const leaf = parts[parts.length - 1] ?? categoryPath;

  const leafsForRoot = categoryDescendantLeafSlugs(categoryPath);

  const andTagFilters = parts.map((part) => ({
    tags: {
      some: {
        tag: { name: part },
      },
    },
  }));

  const where = {
    status: "PUBLISHED",
    OR: [
      { type: "CATEGORY", slug: `category/${categoryPath}` },
      { product: { category: categoryPath } },
      { product: { category: { startsWith: `${categoryPath}/` } } },
      { tags: { some: { tag: { name: categoryPath } } } },
      { tags: { some: { tag: { name: leaf } } } },
      { tags: { some: { tag: { name: { in: leafsForRoot } } } } },
      { tags: { some: { tag: { name: leaf } } }, AND: andTagFilters },
    ],
  };

  const safePage = Math.max(1, page);
  const safeLimit = Math.max(1, Math.min(100, limit));

  const [items, total] = await Promise.all([
    prisma.page.findMany({
      where: where as never,
      orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
      select: {
        id: true,
        slug: true,
        title: true,
        excerpt: true,
        publishedAt: true,
        type: true,
        heroImageUrl: true,
      },
    }),
    prisma.page.count({ where: where as never }),
  ]);

  return {
    items,
    total,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.max(1, Math.ceil(total / safeLimit)),
  };
}

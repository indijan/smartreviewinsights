import { categoryDescendantLeafSlugs } from "@/lib/category-taxonomy";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { cache } from "react";
import { normalizeSlug } from "@/lib/slug";

export type SearchListItem = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  type: string;
  publishedAt: Date | null;
  heroImageUrl: string | null;
  canonicalName: string | null;
};

type SearchPageRow = SearchListItem & {
  rank: number;
};

const PAGE_PUBLISHED_LOOKUP_SELECT = {
  id: true,
  slug: true,
  status: true,
} satisfies Prisma.PageSelect;

const PAGE_WITH_OFFERS_SELECT = {
  id: true,
  slug: true,
  type: true,
  title: true,
  excerpt: true,
  contentMd: true,
  heroImageUrl: true,
  status: true,
  publishedAt: true,
  updatedAt: true,
  createdAt: true,
  productId: true,
  product: {
    select: {
      id: true,
      canonicalName: true,
      category: true,
      attributes: true,
      offers: {
        where: {
          OR: [{ partnerId: null }, { partner: { isEnabled: true } }],
        },
        orderBy: { updatedAt: "desc" as const },
        include: { partner: true },
      },
    },
  },
  tags: {
    select: {
      tag: {
        select: { name: true },
      },
    },
  },
} satisfies Prisma.PageSelect;

const getPageBySlugCached = cache(async (slug: string) =>
  prisma.page.findUnique({
    where: { slug },
    select: PAGE_WITH_OFFERS_SELECT,
  }),
);

const getPageByIdCached = cache(async (id: string) =>
  prisma.page.findUnique({
    where: { id },
    select: PAGE_WITH_OFFERS_SELECT,
  }),
);

const lookupPublishedPageSlugCached = cache(async (slug: string) => {
  const exact = await prisma.page.findUnique({
    where: { slug },
    select: PAGE_PUBLISHED_LOOKUP_SELECT,
  });
  if (exact?.status === "PUBLISHED") {
    return { resolvedSlug: exact.slug, canonicalRedirectSlug: null as string | null };
  }

  const altSlugs = slug.startsWith("offers/amazon/")
    ? [slug.replace(/^offers\/amazon\//, "")]
    : [`offers/amazon/${slug}`];

  const alt = await prisma.page.findFirst({
    where: {
      slug: { in: altSlugs },
      status: "PUBLISHED",
    },
    select: PAGE_PUBLISHED_LOOKUP_SELECT,
  });

  if (!alt) {
    return { resolvedSlug: null as string | null, canonicalRedirectSlug: null as string | null };
  }

  return {
    resolvedSlug: alt.slug,
    canonicalRedirectSlug: alt.slug === slug ? null : alt.slug,
  };
});

export async function getPageBySlug(rawSlug: string) {
  const slug = normalizeSlug(rawSlug);
  if (!slug) return null;

  return getPageBySlugCached(slug);
}

export async function getPageById(id: string) {
  return getPageByIdCached(id);
}

export async function resolvePublishedPageBySlug(rawSlug: string) {
  const slug = normalizeSlug(rawSlug);
  if (!slug) return { page: null as Awaited<ReturnType<typeof getPageBySlug>> | null, canonicalRedirectSlug: null as string | null };

  const lookup = await lookupPublishedPageSlugCached(slug);
  if (!lookup.resolvedSlug) return { page: null, canonicalRedirectSlug: null };

  const page = await getPageBySlugCached(lookup.resolvedSlug);
  if (!page || page.status !== "PUBLISHED") {
    return { page: null, canonicalRedirectSlug: null };
  }

  return {
    page,
    canonicalRedirectSlug: lookup.canonicalRedirectSlug,
  };
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

export function buildTextSearchFilter(query?: string | null) {
  const q = String(query || "").trim();
  if (!q) return null;
  const parts = q.split(/\s+/).filter(Boolean).slice(0, 8);
  if (parts.length === 0) return null;
  return {
    AND: parts.map((part) => ({
      OR: [
        { title: { contains: part, mode: "insensitive" as const } },
        { excerpt: { contains: part, mode: "insensitive" as const } },
        { product: { canonicalName: { contains: part, mode: "insensitive" as const } } },
      ],
    })),
  };
}

function normalizeSearchTerms(query?: string | null) {
  return String(query || "")
    .trim()
    .split(/\s+/)
    .map((part) => part.replace(/[^\p{L}\p{N}-]+/gu, "").toLowerCase())
    .filter(Boolean)
    .slice(0, 8);
}

export async function searchPublishedPages(query: string, opts?: { categoryPath?: string | null; limit?: number }) {
  const terms = normalizeSearchTerms(query);
  if (terms.length === 0) return [] as SearchListItem[];
  const limit = Math.max(10, Math.min(200, opts?.limit ?? 80));
  const categoryPath = normalizeSlug(String(opts?.categoryPath || ""));
  const tsQuery = terms.join(" & ");
  const rows = await prisma.$queryRaw<SearchPageRow[]>(Prisma.sql`
    SELECT
      p.id,
      p.slug,
      p.title,
      p.excerpt,
      p.type::text AS type,
      p."publishedAt",
      p."heroImageUrl",
      pr."canonicalName" AS "canonicalName",
      GREATEST(
        ts_rank_cd(
          to_tsvector('simple', concat_ws(' ', coalesce(p.title, ''), coalesce(p.excerpt, ''))),
          to_tsquery('simple', ${tsQuery})
        ),
        ts_rank_cd(
          to_tsvector('simple', concat_ws(' ', coalesce(pr."canonicalName", ''), coalesce(pr.category, ''))),
          to_tsquery('simple', ${tsQuery})
        )
      ) AS rank
    FROM "Page" p
    LEFT JOIN "Product" pr ON pr.id = p."productId"
    WHERE p.status = 'PUBLISHED'
      AND p."publishedAt" IS NOT NULL
      AND (
        to_tsvector('simple', concat_ws(' ', coalesce(p.title, ''), coalesce(p.excerpt, '')))
          @@ to_tsquery('simple', ${tsQuery})
        OR
        to_tsvector('simple', concat_ws(' ', coalesce(pr."canonicalName", ''), coalesce(pr.category, '')))
          @@ to_tsquery('simple', ${tsQuery})
      )
      ${categoryPath
        ? Prisma.sql`
      AND (
        pr.category = ${categoryPath}
        OR pr.category LIKE ${`${categoryPath}/%`}
        OR EXISTS (
          SELECT 1
          FROM "PageTag" pt
          JOIN "Tag" t ON t.id = pt."tagId"
          WHERE pt."pageId" = p.id
            AND t.name = ${categoryPath}
        )
      )`
        : Prisma.empty}
    ORDER BY rank DESC, p."publishedAt" DESC, p."updatedAt" DESC
    LIMIT ${limit}
  `);

  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    excerpt: r.excerpt,
    type: r.type,
    publishedAt: r.publishedAt,
    heroImageUrl: r.heroImageUrl,
    canonicalName: r.canonicalName,
  }));
}

export async function getLatestPages(page = 1, limit = 50, query?: string | null) {
  const safePage = Math.max(1, page);
  const safeLimit = Math.max(1, Math.min(100, limit));
  const searchFilter = buildTextSearchFilter(query);
  const where = {
    status: "PUBLISHED",
    publishedAt: { not: null },
    ...(searchFilter ? searchFilter : {}),
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

export async function getLatestTrafficTestPages(limit = 6) {
  const safeLimit = Math.max(1, Math.min(24, limit));
  return prisma.page.findMany({
    where: {
      status: "PUBLISHED",
      publishedAt: { not: null },
      OR: [
        { slug: { startsWith: "insights/" } },
        { slug: { startsWith: "guides/" } },
        { slug: { startsWith: "next/" } },
      ],
    },
    orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
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
  }) as Promise<SearchListItem[]>;
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

export async function getCategoryPages(slugParts: string[], page = 1, limit = 30, query?: string | null) {
  const categoryPath = normalizeSlug(slugParts.join("/"));
  const parts = categoryPath.split("/").filter(Boolean);
  const leaf = parts[parts.length - 1] ?? categoryPath;
  const safePage = Math.max(1, page);
  const safeLimit = Math.max(1, Math.min(100, limit));
  const offset = (safePage - 1) * safeLimit;
  const leafsForRoot = categoryDescendantLeafSlugs(categoryPath);
  const tsTerms = normalizeSearchTerms(query);
  const tsQuery = tsTerms.join(" & ");
  const leafValues = Array.from(new Set([leaf, ...leafsForRoot])).filter(Boolean);

  const categoryMatchSql = Prisma.sql`
    (
      (p.type = 'CATEGORY' AND p.slug = ${`category/${categoryPath}`})
      OR pr.category = ${categoryPath}
      OR pr.category LIKE ${`${categoryPath}/%`}
      OR EXISTS (
        SELECT 1
        FROM "PageTag" pt
        JOIN "Tag" t ON t.id = pt."tagId"
        WHERE pt."pageId" = p.id
          AND (
            t.name = ${categoryPath}
            OR t.name IN (${Prisma.join(leafValues)})
          )
      )
      OR (
        EXISTS (
          SELECT 1
          FROM "PageTag" pt
          JOIN "Tag" t ON t.id = pt."tagId"
          WHERE pt."pageId" = p.id
            AND t.name = ${leaf}
        )
        AND ${parts.length > 0
          ? Prisma.sql`NOT EXISTS (
              SELECT 1
              FROM unnest(ARRAY[${Prisma.join(parts)}]::text[]) AS required_tag(name)
              WHERE NOT EXISTS (
                SELECT 1
                FROM "PageTag" pt2
                JOIN "Tag" t2 ON t2.id = pt2."tagId"
                WHERE pt2."pageId" = p.id
                  AND t2.name = required_tag.name
              )
            )`
          : Prisma.sql`TRUE`}
      )
    )
  `;

  const searchSql =
    tsTerms.length > 0
      ? Prisma.sql`
      AND (
        to_tsvector('simple', coalesce(p.title, '') || ' ' || coalesce(p.excerpt, ''))
          @@ to_tsquery('simple', ${tsQuery})
        OR
        to_tsvector('simple', coalesce(pr."canonicalName", '') || ' ' || coalesce(pr.category, ''))
          @@ to_tsquery('simple', ${tsQuery})
      )`
      : Prisma.empty;

  const [items, totalRows] = await Promise.all([
    prisma.$queryRaw<Array<{
      id: string;
      slug: string;
      title: string;
      excerpt: string | null;
      publishedAt: Date | null;
      type: string;
      heroImageUrl: string | null;
    }>>(Prisma.sql`
      SELECT
        p.id,
        p.slug,
        p.title,
        p.excerpt,
        p."publishedAt",
        p.type::text AS type,
        p."heroImageUrl"
      FROM "Page" p
      LEFT JOIN "Product" pr ON pr.id = p."productId"
      WHERE p.status = 'PUBLISHED'
        AND ${categoryMatchSql}
        ${searchSql}
      ORDER BY p."publishedAt" DESC, p."updatedAt" DESC
      OFFSET ${offset}
      LIMIT ${safeLimit}
    `),
    prisma.$queryRaw<Array<{ total: number }>>(Prisma.sql`
      SELECT COUNT(*)::int AS total
      FROM "Page" p
      LEFT JOIN "Product" pr ON pr.id = p."productId"
      WHERE p.status = 'PUBLISHED'
        AND ${categoryMatchSql}
        ${searchSql}
    `),
  ]);
  const total = totalRows[0]?.total ?? 0;

  return {
    items,
    total,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.max(1, Math.ceil(total / safeLimit)),
  };
}

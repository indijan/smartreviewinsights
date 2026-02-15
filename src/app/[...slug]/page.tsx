import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { marked } from "marked";
import ImageGallery from "@/components/image-gallery";
import StickySidebar from "@/components/sticky-sidebar";
import { normalizeContentForRender } from "@/lib/content";
import { rankOffers } from "@/lib/offers-ranking";
import { getContextualOffersForPage, getRelatedReviewPages, resolvePublishedPageBySlug } from "@/lib/pages";
import { joinSlug } from "@/lib/slug";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string[] }> };
const MAX_DISPLAY_OFFERS = 3;

function normalizeAmazonImage(url: string) {
  return String(url || "")
    .replace(/(\._[A-Z0-9,]+_)\./gi, ".")
    .replace(/(\.jpg|\.jpeg|\.png|\.webp)\?.*$/i, "$1")
    .trim();
}

function imageScore(url: string) {
  let score = 0;
  const normalized = normalizeAmazonImage(url);
  const nums = Array.from(normalized.matchAll(/([0-9]{3,4})/g)).map((m) => Number(m[1]));
  if (nums.length > 0) score += Math.max(...nums);
  if (/sl1500|sl2000|ul1500|ux1500|ac_sl1500|ac_ul1500/i.test(normalized)) score += 2000;
  if (/sprite|icon|thumb|thumbnail|play|logo/i.test(normalized)) score -= 3000;
  return score;
}

function isLikelyProductOfferUrl(source: string, url: string) {
  try {
    const u = new URL(url);
    const path = u.pathname.toLowerCase();
    if (source === "AMAZON") return /\/dp\/|\/gp\/product\//.test(path);
    if (source === "EBAY") return /\/itm\//.test(path);
    if (source === "ALIEXPRESS") return /\/item\//.test(path);
    if (source === "ALIBABA") return /\/product-detail\//.test(path);
    if (source === "TEMU") return /\/goods\.html|\/-g-/.test(path);
    return true;
  } catch {
    return false;
  }
}

function pickDisplayOffers<T extends { offer: { source: string } }>(
  ranked: T[],
  maxItems = MAX_DISPLAY_OFFERS,
) {
  const allAmazon = ranked.length > 0 && ranked.every((r) => r.offer.source === "AMAZON");
  if (allAmazon) return ranked.slice(0, maxItems);

  const out: T[] = [];
  const used = new Set<string>();
  const amazon = ranked.find((r) => r.offer.source === "AMAZON");
  if (amazon) {
    out.push(amazon);
    used.add("AMAZON");
  }
  for (const item of ranked) {
    if (out.length >= maxItems) break;
    if (used.has(item.offer.source)) continue;
    out.push(item);
    used.add(item.offer.source);
  }
  return out.slice(0, maxItems);
}

function cleanOfferTitle(input: string | null | undefined) {
  return String(input || "")
    .replace(/^Amazon\.com\s*:\s*/i, "")
    .trim();
}

function splitAtPros(html: string) {
  const match = html.match(/<h2[^>]*>\s*Pros\s*<\/h2>/i);
  if (!match || match.index == null) return null;
  const idx = match.index;
  return {
    beforePros: html.slice(0, idx),
    prosAndAfter: html.slice(idx),
  };
}

function titleCaseSlugPart(part: string) {
  return part
    .split("-")
    .filter(Boolean)
    .map((x) => x.charAt(0).toUpperCase() + x.slice(1))
    .join(" ");
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const resolved = await resolvePublishedPageBySlug(joinSlug(slug));
  const page = resolved.page;

  if (!page) {
    return { title: "Not found" };
  }

  return {
    title: page.title,
    description: page.excerpt ?? undefined,
    alternates: { canonical: `/${page.slug}` },
  };
}

export default async function CatchAllPage({ params }: Props) {
  const { slug } = await params;
  const requestedSlug = joinSlug(slug);
  const resolved = await resolvePublishedPageBySlug(requestedSlug);
  const page = resolved.page;

  if (!page || page.status !== "PUBLISHED") {
    notFound();
  }
  if (resolved.canonicalRedirectSlug && resolved.canonicalRedirectSlug !== requestedSlug) {
    redirect(`/${resolved.canonicalRedirectSlug}`);
  }

  const normalizedMd = normalizeContentForRender(page.contentMd, page.title, page.excerpt);
  const htmlRaw = marked.parse(normalizedMd) as string;
  const imgMatches = [...htmlRaw.matchAll(/<img[^>]*src=["']([^"']+)["'][^>]*>/gi)];
  const productImages =
    page.product?.attributes &&
    typeof page.product.attributes === "object" &&
    Array.isArray((page.product.attributes as Record<string, unknown>).images)
      ? ((page.product.attributes as Record<string, unknown>).images as unknown[]).filter((x): x is string => typeof x === "string")
      : [];
  const galleryImages = [
    ...new Set(
      [page.heroImageUrl, ...productImages, ...imgMatches.map((m) => m[1])]
        .filter(Boolean)
        .map((x) => normalizeAmazonImage(String(x))),
    ),
  ].sort((a, b) => imageScore(b) - imageScore(a));
  const html = htmlRaw
    .replace(/<a[^>]*>\s*<img[^>]*>\s*<\/a>/gi, "")
    .replace(/<img[^>]*>/gi, "")
    .replace(/<figure[^>]*>\s*<img[^>]*>\s*<\/figure>/gi, "")
    .replace(/<p>\s*<img[^>]*>\s*<\/p>/gi, "")
    .replace(/<li>\s*<img[^>]*>\s*<\/li>/gi, "")
    .replace(/<li>\s*(?:&bull;|•|&middot;|·|\*|-\s*)\s*<\/li>/gi, "")
    .replace(/<li>\s*(?:&nbsp;|\s|<br\s*\/?>)*\s*<\/li>/gi, "")
    .replace(/<li>\s*(?:<[^>]+>\s*)*<\/li>/gi, "")
    .replace(/<ul>\s*(?:&nbsp;|\s|<br\s*\/?>)*\s*<\/ul>/gi, "")
    .replace(/<ol>\s*(?:&nbsp;|\s|<br\s*\/?>)*\s*<\/ol>/gi, "")
    .replace(/<p>\s*(?:&nbsp;|\s|<br\s*\/?>)*\s*<\/p>/gi, "")
    .replace(
      /<a\s+([^>]*?)href=(["'])(https?:\/\/[^"']+)\2([^>]*)>/gi,
      '<a $1href=$2$3$2$4 target="_blank" rel="noopener noreferrer nofollow">'
    );
  const contextualOffers = await getContextualOffersForPage(page);
  const candidateOffers = page.type === "REVIEW" ? (page.product?.offers ?? []) : (page.product?.offers?.length ? page.product.offers : contextualOffers);
  const validOffers = candidateOffers.filter((o: { source: string; affiliateUrl: string }) => isLikelyProductOfferUrl(o.source, o.affiliateUrl));
  const dedupedOffers = Array.from(new Map(validOffers.map((o: { source: string; affiliateUrl: string }) => [`${o.source}::${o.affiliateUrl}`, o])).values());
  const rankedOffers = rankOffers(dedupedOffers as never);
  const displayOffers = pickDisplayOffers(rankedOffers);
  const mobileSplit = splitAtPros(html);
  const firstOffer = rankedOffers[0]?.offer ?? null;
  const related = await getRelatedReviewPages({
    pageId: page.id,
    category: page.product?.category ?? null,
    slugPrefix: page.slug.split("/").slice(0, 2).join("/") || null,
    title: page.title,
    tagNames: page.tags.map((t: { tag: { name: string } }) => t.tag.name),
    limit: 3,
  });
  const categoryPath = page.product?.category || page.slug.split("/").slice(0, -1).join("/");
  const categoryParts = categoryPath.split("/").filter((x: string) => Boolean(x));
  const breadcrumbCategory = categoryParts.map((part: string, idx: number) => ({
    label: titleCaseSlugPart(part),
    href: `/category/${categoryParts.slice(0, idx + 1).join("/")}`,
  }));

  const structuredData = firstOffer
    ? {
        "@context": "https://schema.org",
        "@type": "Product",
        name: page.product?.canonicalName ?? page.title,
        description: page.excerpt ?? page.title,
        offers: {
          "@type": "Offer",
          priceCurrency: firstOffer.currency,
          price: firstOffer.price?.toString(),
          url: `https://smartreviewinsights.com/go/${firstOffer.id}?page=${encodeURIComponent(page.slug)}&ref=schema`,
          availability: "https://schema.org/InStock",
        },
      }
    : {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: page.title,
        description: page.excerpt ?? page.title,
        datePublished: page.publishedAt?.toISOString(),
        dateModified: page.updatedAt.toISOString(),
        mainEntityOfPage: `https://smartreviewinsights.com/${page.slug}`,
      };

  return (
    <main>
      <article className="card article">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          {breadcrumbCategory.map((item: { label: string; href: string }) => (
            <span key={item.href}>
              <span className="sep">/</span>
              <Link href={item.href}>{item.label}</Link>
            </span>
          ))}
          <span className="sep">/</span>
          <span className="current">{page.title}</span>
        </nav>

        <h1 className="page-title">{page.title}</h1>
        {page.excerpt ? (
          <div className="tldr">
            <p>{page.excerpt}</p>
          </div>
        ) : null}

        {galleryImages.length > 0 ? <ImageGallery images={galleryImages} altBase={page.title} /> : null}

        <div className="article-layout">
          <div>
            <div className="prose prose-desktop" dangerouslySetInnerHTML={{ __html: html }} />
            <div className="prose prose-mobile">
              {mobileSplit ? (
                <>
                  <div dangerouslySetInnerHTML={{ __html: mobileSplit.beforePros }} />
                  {displayOffers.length ? (
                    <section className="mobile-offer-inline card">
                      <h3 className="page-title" style={{ fontSize: "1.05rem" }}>Live Product Offers</h3>
                      <div className="offer-sidebar-list">
                        {displayOffers.map(({ offer }: { offer: { id: string; source: string; affiliateUrl: string; title: string | null; price: { toString(): string } | null; currency: string; partner?: { name: string } | null } }) => (
                          <a
                            key={`mobile-side-${offer.id}`}
                            href={
                              offer.source === "AMAZON"
                                ? offer.affiliateUrl
                                : `/go/${offer.id}?page=${encodeURIComponent(page.slug)}&ref=offer-mobile`
                            }
                            target="_blank"
                            rel="sponsored nofollow noopener noreferrer"
                            className="offer-sidebar-item"
                          >
                            <span className="meta">{cleanOfferTitle(offer.title) || "Product offer"}</span>
                            <span>{offer.price ? `${offer.price.toString()} ${offer.currency}` : "Live partner price"}</span>
                            <span className="offer-cta">Check Price</span>
                          </a>
                        ))}
                      </div>
                    </section>
                  ) : null}
                  <div dangerouslySetInnerHTML={{ __html: mobileSplit.prosAndAfter }} />
                </>
              ) : (
                <div dangerouslySetInnerHTML={{ __html: html }} />
              )}
            </div>
            {displayOffers.length ? (
              <section className="mobile-offer-bottom card">
                <h3 className="page-title" style={{ fontSize: "1.05rem" }}>Live Product Offers</h3>
                <div className="offer-sidebar-list">
                  {displayOffers.map(({ offer }: { offer: { id: string; source: string; affiliateUrl: string; title: string | null; price: { toString(): string } | null; currency: string; partner?: { name: string } | null } }) => (
                    <a
                      key={`mobile-bottom-${offer.id}`}
                      href={
                        offer.source === "AMAZON"
                          ? offer.affiliateUrl
                          : `/go/${offer.id}?page=${encodeURIComponent(page.slug)}&ref=offer-mobile-bottom`
                      }
                      target="_blank"
                      rel="sponsored nofollow noopener noreferrer"
                      className="offer-sidebar-item"
                    >
                      <span className="meta">{cleanOfferTitle(offer.title) || "Product offer"}</span>
                      <span>{offer.price ? `${offer.price.toString()} ${offer.currency}` : "Live partner price"}</span>
                      <span className="offer-cta">Check Price</span>
                    </a>
                  ))}
                </div>
              </section>
            ) : null}
            {related.length ? (
              <section className="offer-section">
                <h3 className="page-title" style={{ fontSize: "1.12rem" }}>Related Reviews</h3>
                <div className="offer-grid">
                  {related.map((item: { id: string; slug: string; title: string; excerpt: string | null; heroImageUrl: string | null }) => (
                    <Link key={item.id} href={`/${item.slug}`} className="card offer-card related-item" style={{ textDecoration: "none", color: "inherit" }}>
                      <div className={`related-row${item.heroImageUrl ? "" : " no-thumb"}`}>
                        {item.heroImageUrl ? (
                          <img src={item.heroImageUrl} alt={item.title} className="related-thumb" loading="lazy" />
                        ) : null}
                        <div className="related-content">
                          <strong className="offer-title">{item.title}</strong>
                          {item.excerpt ? <p className="meta">{item.excerpt}</p> : null}
                          <span className="offer-cta">Read Review</span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}

          </div>

          {displayOffers.length ? (
            <StickySidebar className="offer-sticky-wrap">
              <aside className="offer-sidebar card">
              <h3 className="page-title" style={{ fontSize: "1.05rem" }}>Live Product Offers</h3>
              <div className="offer-sidebar-list">
                {displayOffers.map(({ offer }: { offer: { id: string; source: string; affiliateUrl: string; title: string | null; price: { toString(): string } | null; currency: string; partner?: { name: string } | null } }) => (
                  <a
                    key={`side-${offer.id}`}
                    href={
                      offer.source === "AMAZON"
                        ? offer.affiliateUrl
                        : `/go/${offer.id}?page=${encodeURIComponent(page.slug)}&ref=offer-sticky`
                    }
                    target="_blank"
                    rel="sponsored nofollow noopener noreferrer"
                    className="offer-sidebar-item"
                  >
                    <span className="meta">{cleanOfferTitle(offer.title) || "Product offer"}</span>
                    <span>{offer.price ? `${offer.price.toString()} ${offer.currency}` : "Live partner price"}</span>
                    <span className="offer-cta">Check Price</span>
                  </a>
                ))}
              </div>
              </aside>
            </StickySidebar>
          ) : null}
        </div>

        <p className="disclosure">This page may include affiliate links.</p>
      </article>

      <p style={{ marginTop: "1rem" }}>
        <Link className="btn" href="/">
          Back To Home
        </Link>
      </p>
    </main>
  );
}

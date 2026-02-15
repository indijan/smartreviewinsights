import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { marked } from "marked";
import ImageGallery from "@/components/image-gallery";
import StickySidebar from "@/components/sticky-sidebar";
import { isAdminSession } from "@/lib/admin";
import { normalizeContentForRender } from "@/lib/content";
import { rankOffers } from "@/lib/offers-ranking";
import { getContextualOffersForPage, getPageById } from "@/lib/pages";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };
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

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (!(await isAdminSession())) return { title: "Preview" };
  const { id } = await params;
  const page = await getPageById(id);
  if (!page) return { title: "Not found" };
  return { title: `Preview: ${page.title}` };
}

export default async function AdminPostPreviewPage({ params }: Props) {
  if (!(await isAdminSession())) {
    redirect("/admin/login");
  }

  const { id } = await params;
  const page = await getPageById(id);
  if (!page) notFound();

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
  const html = htmlRaw.replace(
    /<a\s+([^>]*?)href=(["'])(https?:\/\/[^"']+)\2([^>]*)>/gi,
    '<a $1href=$2$3$2$4 target="_blank" rel="noopener noreferrer nofollow">'
  );
  const contextualOffers = await getContextualOffersForPage(page);
  const candidateOffers = page.type === "REVIEW" ? (page.product?.offers ?? []) : (page.product?.offers?.length ? page.product.offers : contextualOffers);
  const validOffers = candidateOffers.filter((o) => isLikelyProductOfferUrl(o.source, o.affiliateUrl));
  const dedupedOffers = Array.from(new Map(validOffers.map((o) => [`${o.source}::${o.affiliateUrl}`, o])).values());
  const rankedOffers = rankOffers(dedupedOffers as never);
  const displayOffers = pickDisplayOffers(rankedOffers);

  return (
    <main>
      <article className="card article">
        <p className="meta">Admin Preview · {page.status}</p>
        <h1 className="page-title">{page.title}</h1>
        {page.excerpt ? (
          <div className="tldr">
            <p>{page.excerpt}</p>
          </div>
        ) : null}
        {galleryImages.length > 0 ? <ImageGallery images={galleryImages} altBase={page.title} /> : null}
        <div className="article-layout">
          <div>
            <div className="prose" dangerouslySetInnerHTML={{ __html: html }} />
          </div>
          {displayOffers.length ? (
            <StickySidebar className="offer-sticky-wrap">
              <aside className="offer-sidebar card">
              <h3 className="page-title" style={{ fontSize: "1.05rem" }}>Live Product Offers</h3>
              <div className="offer-sidebar-list">
                {displayOffers.map(({ offer }) => (
                  <a
                    key={`preview-side-${offer.id}`}
                    href={
                      offer.source === "AMAZON"
                        ? offer.affiliateUrl
                        : `/go/${offer.id}?page=${encodeURIComponent(page.slug)}&ref=offer-box`
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
      </article>

      <p style={{ marginTop: "1rem" }}>
        <Link className="btn" href={`/admin/posts/${page.id}`}>
          Back To Editor
        </Link>
      </p>
    </main>
  );
}

import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { categoryLeafNodes, CATEGORY_TAXONOMY } from "@/lib/category-taxonomy";
import { expandSearchQueryWithAi, rankSearchCandidatesWithAi } from "@/lib/intelligent-search";
import { getLatestPages, getLatestTrafficTestPages, searchPublishedPages, type SearchListItem } from "@/lib/pages";

export const revalidate = 3600;

type Props = {
  searchParams: Promise<{ page?: string; q?: string; ai?: string }>;
};

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { page, q } = await searchParams;
  const currentPage = Math.max(1, Number(page ?? "1") || 1);
  const rawQuery = String(q || "").trim();

  if (rawQuery) {
    return {
      title: `Search: ${rawQuery}`,
      description: `Search results for ${rawQuery} on SmartReviewInsights.`,
      alternates: { canonical: "/" },
      robots: { index: false, follow: true },
    };
  }

  if (currentPage > 1) {
    return {
      title: `Latest Reviews - Page ${currentPage}`,
      description: `Browse the latest product reviews and buying guides on page ${currentPage}.`,
      alternates: { canonical: "/" },
      robots: { index: false, follow: true },
    };
  }

  return {
    title: "Latest Product Reviews And Buying Guides",
    description: "Browse the latest independent product reviews, comparisons, and price-aware buying guides.",
    alternates: { canonical: "/" },
    openGraph: {
      type: "website",
      url: "https://smartreviewinsights.com/",
      title: "Latest Product Reviews And Buying Guides",
      description: "Browse the latest independent product reviews, comparisons, and price-aware buying guides.",
    },
    twitter: {
      card: "summary_large_image",
      title: "Latest Product Reviews And Buying Guides",
      description: "Browse the latest independent product reviews, comparisons, and price-aware buying guides.",
    },
  };
}

export default async function HomePage({ searchParams }: Props) {
  const { page, q, ai } = await searchParams;
  const currentPage = Number(page ?? "1");
  const rawQuery = String(q || "").trim();
  const aiMode = ai === "1";
  const aiExpanded = aiMode ? await expandSearchQueryWithAi(rawQuery, null) : { effectiveQuery: rawQuery, aiUsed: false };
  const effectiveQuery = aiExpanded.effectiveQuery;
  const [result, trafficTests] = await Promise.all([
    getLatestPages(Number.isFinite(currentPage) ? currentPage : 1, 50),
    getLatestTrafficTestPages(6),
  ]);
  let pages = result.items as SearchListItem[];
  let topResults: SearchListItem[] = [];
  let otherResults: SearchListItem[] = [];
  let noRelevant = false;
  let aiRankUsed = false;
  if (rawQuery) {
    const candidates = await searchPublishedPages(effectiveQuery || rawQuery, { limit: 120 });
    const ranked = await rankSearchCandidatesWithAi(rawQuery, candidates);
    const byId = new Map(candidates.map((x) => [x.id, x]));
    topResults = ranked.top.map((x) => byId.get(x.id)).filter((x): x is SearchListItem => Boolean(x));
    otherResults = ranked.others.map((x) => byId.get(x.id)).filter((x): x is SearchListItem => Boolean(x));
    noRelevant = ranked.noRelevant;
    aiRankUsed = ranked.aiUsed;
    pages = [];
  }
  const startPage = Math.max(1, result.page - 3);
  const endPage = Math.min(result.totalPages, result.page + 3);
  const pageWindow: number[] = [];
  for (let p = startPage; p <= endPage; p += 1) {
    pageWindow.push(p);
  }
  const featuredCategories = categoryLeafNodes().slice(0, 8);
  const topLevelCategories = CATEGORY_TAXONOMY;

  return (
    <main>
      <div className="page-head">
        <h1 className="page-title">SmartReviewInsights</h1>
        <p className="page-sub">
          Independent product reviews, side-by-side comparisons, and price-aware buying guides across electronics, lifestyle, pets, and more.
        </p>
        <form method="get" className="search-hero card">
          <input
            type="search"
            name="q"
            defaultValue={rawQuery}
            placeholder="Search products, models, features..."
            className="search-hero-input"
          />
          <div className="search-hero-actions">
            <button className="search-hero-btn" type="submit" name="ai" value="1">AI Assist</button>
          </div>
          {effectiveQuery ? (
            <p className="meta">
              Query: <strong>{effectiveQuery}</strong>
              {aiExpanded.aiUsed ? " · AI query rewrite" : ""}
              {aiRankUsed ? " · AI relevance ranking" : ""}
            </p>
          ) : null}
        </form>
      </div>

      {!rawQuery ? (
        <>
          <section className="card">
            <h2>Explore Review Categories</h2>
            <p className="page-sub">
              Start with a topic hub to discover reviews faster and crawl the site through stronger category paths.
            </p>
            <div className="pager-row">
              {topLevelCategories.map((category) => (
                <Link key={category.path} className="chip" href={`/category/${category.path}`}>
                  {category.label}
                </Link>
              ))}
            </div>
          </section>

          <section className="card">
            <h2>Popular Buying Guide Topics</h2>
            <div className="pager-row">
              {featuredCategories.map((category) => (
                <Link key={category.path} className="chip" href={`/category/${category.path}`}>
                  {category.label}
                </Link>
              ))}
            </div>
          </section>

          {trafficTests.length ? (
            <section className="card">
              <h2>Latest Attention Tests</h2>
              <p className="page-sub">
                Fresh traffic-arbitrage style pages generated for cheap-click capture, attention stretch, and click exits.
              </p>
              <p style={{ marginTop: "0.6rem" }}>
                <Link className="chip" href="/insights">Open All Attention Tests</Link>
              </p>
              <div className="grid-list" style={{ marginTop: "0.8rem" }}>
                {trafficTests.map((entry) => (
                  <article key={entry.id} className="card article-link-card">
                    <div className={`article-card-row${entry.heroImageUrl ? "" : " no-thumb"}`}>
                      {entry.heroImageUrl ? (
                        <Link href={`/${entry.slug}`} className="article-card-thumb-link" aria-label={entry.title}>
                          <Image src={entry.heroImageUrl} alt={entry.title} className="article-card-thumb" width={320} height={320} loading="lazy" />
                        </Link>
                      ) : null}
                      <div className="article-card-content">
                        <Link href={`/${entry.slug}`}><h2>{entry.title}</h2></Link>
                        {entry.excerpt ? <p className="page-sub">{entry.excerpt}</p> : null}
                        <p className="meta">{entry.slug.startsWith("insights/") ? "Entry test" : entry.slug.startsWith("guides/") ? "Bridge test" : "Exit test"}</p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
        </>
      ) : null}

      {rawQuery ? (
        <>
          {noRelevant ? (
            <section className="grid-list">
              <div className="card">No relevant review found for this query.</div>
            </section>
          ) : null}
          {topResults.length ? (
            <section className="grid-list">
              {topResults.map((entry) => (
                <article key={entry.id} className="card article-link-card">
                  <div className={`article-card-row${entry.heroImageUrl ? "" : " no-thumb"}`}>
                    {entry.heroImageUrl ? (
                      <Link href={`/${entry.slug}`} className="article-card-thumb-link" aria-label={entry.title}>
                        <Image src={entry.heroImageUrl} alt={entry.title} className="article-card-thumb" width={320} height={320} loading="lazy" />
                      </Link>
                    ) : null}
                    <div className="article-card-content">
                      <Link href={`/${entry.slug}`}><h2>{entry.title}</h2></Link>
                      {entry.excerpt ? <p className="page-sub">{entry.excerpt}</p> : null}
                    </div>
                  </div>
                </article>
              ))}
            </section>
          ) : null}
          {otherResults.length ? (
            <>
              <p className="meta" style={{ marginTop: "1rem" }}>Less relevant results</p>
              <section className="grid-list">
                {otherResults.map((entry) => (
                  <article key={entry.id} className="card article-link-card">
                    <div className={`article-card-row${entry.heroImageUrl ? "" : " no-thumb"}`}>
                      {entry.heroImageUrl ? (
                        <Link href={`/${entry.slug}`} className="article-card-thumb-link" aria-label={entry.title}>
                          <Image src={entry.heroImageUrl} alt={entry.title} className="article-card-thumb" width={320} height={320} loading="lazy" />
                        </Link>
                      ) : null}
                      <div className="article-card-content">
                        <Link href={`/${entry.slug}`}><h2>{entry.title}</h2></Link>
                        {entry.excerpt ? <p className="page-sub">{entry.excerpt}</p> : null}
                      </div>
                    </div>
                  </article>
                ))}
              </section>
            </>
          ) : null}
        </>
      ) : (
      <section className="grid-list">
        {pages.length === 0 ? (
          <div className="card">No pages found.</div>
        ) : (
          pages.map((entry) => (
            <article key={entry.id} className="card article-link-card">
              <div className={`article-card-row${entry.heroImageUrl ? "" : " no-thumb"}`}>
              {entry.heroImageUrl ? (
                <Link href={`/${entry.slug}`} className="article-card-thumb-link" aria-label={entry.title}>
                  <Image src={entry.heroImageUrl} alt={entry.title} className="article-card-thumb" width={320} height={320} loading="lazy" />
                </Link>
              ) : null}
                <div className="article-card-content">
                  <Link href={`/${entry.slug}`}>
                    <h2>{entry.title}</h2>
                  </Link>
                  {entry.excerpt ? <p className="page-sub">{entry.excerpt}</p> : null}
                  <p className="meta">
                    {entry.type}
                    {entry.publishedAt ? ` · ${new Date(entry.publishedAt).toLocaleDateString()}` : ""}
                  </p>
                </div>
              </div>
            </article>
          ))
        )}
      </section>
      )}

      {!rawQuery ? (
      <nav className="pager" aria-label="Pagination">
        <p className="meta">
          Page {result.page} / {result.totalPages}
        </p>
        <div className="pager-row">
          {result.page > 1 ? (
            <>
              <Link className="chip" href={`/?page=1${effectiveQuery ? `&q=${encodeURIComponent(rawQuery)}${aiMode ? "&ai=1" : ""}` : ""}`}>
                First
              </Link>
              <Link className="chip" href={`/?page=${result.page - 1}${effectiveQuery ? `&q=${encodeURIComponent(rawQuery)}${aiMode ? "&ai=1" : ""}` : ""}`}>
                Prev
              </Link>
            </>
          ) : null}

          {pageWindow.map((p) => (
            <Link
              key={p}
              className={`chip${p === result.page ? " active" : ""}`}
              href={`/?page=${p}${effectiveQuery ? `&q=${encodeURIComponent(rawQuery)}${aiMode ? "&ai=1" : ""}` : ""}`}
            >
              {p}
            </Link>
          ))}

          {result.page < result.totalPages ? (
            <>
              <Link className="chip" href={`/?page=${result.page + 1}${effectiveQuery ? `&q=${encodeURIComponent(rawQuery)}${aiMode ? "&ai=1" : ""}` : ""}`}>
                Next
              </Link>
              <Link className="chip" href={`/?page=${result.totalPages}${effectiveQuery ? `&q=${encodeURIComponent(rawQuery)}${aiMode ? "&ai=1" : ""}` : ""}`}>
                Last
              </Link>
            </>
          ) : null}
        </div>
      </nav>
      ) : null}
    </main>
  );
}

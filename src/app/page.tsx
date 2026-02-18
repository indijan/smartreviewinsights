import Link from "next/link";
import { expandSearchQueryWithAi, rankSearchCandidatesWithAi } from "@/lib/intelligent-search";
import { getLatestPages, searchPublishedPages, type SearchListItem } from "@/lib/pages";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ page?: string; q?: string; ai?: string }>;
};

export default async function HomePage({ searchParams }: Props) {
  const { page, q, ai } = await searchParams;
  const currentPage = Number(page ?? "1");
  const rawQuery = String(q || "").trim();
  const aiMode = ai === "1";
  const aiExpanded = aiMode ? await expandSearchQueryWithAi(rawQuery, null) : { effectiveQuery: rawQuery, aiUsed: false };
  const effectiveQuery = aiExpanded.effectiveQuery;
  const result = await getLatestPages(Number.isFinite(currentPage) ? currentPage : 1, 50);
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

  return (
    <main>
      <div className="page-head">
        <h1 className="page-title">SmartReviewInsights</h1>
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
                        <img src={entry.heroImageUrl} alt={entry.title} className="article-card-thumb" loading="lazy" />
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
                          <img src={entry.heroImageUrl} alt={entry.title} className="article-card-thumb" loading="lazy" />
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
                  <img src={entry.heroImageUrl} alt={entry.title} className="article-card-thumb" loading="lazy" />
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

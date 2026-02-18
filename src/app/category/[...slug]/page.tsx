import Link from "next/link";
import { categoryLabel } from "@/lib/category-taxonomy";
import { expandSearchQueryWithAi, rankSearchCandidatesWithAi } from "@/lib/intelligent-search";
import { getCategoryPages, searchPublishedPages, type SearchListItem } from "@/lib/pages";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string[] }>; searchParams: Promise<{ page?: string; q?: string; ai?: string }> };

export default async function CategoryPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { page, q, ai } = await searchParams;

  const currentPage = Math.max(1, Number(page ?? "1") || 1);
  const categoryPath = slug.join("/");
  const rawQuery = String(q || "").trim();
  const aiMode = ai === "1";
  const aiExpanded = aiMode ? await expandSearchQueryWithAi(rawQuery, categoryPath) : { effectiveQuery: rawQuery, aiUsed: false };
  const effectiveQuery = aiExpanded.effectiveQuery;
  const result = await getCategoryPages(slug, currentPage, 30);
  let topResults: SearchListItem[] = [];
  let otherResults: SearchListItem[] = [];
  let noRelevant = false;
  let aiRankUsed = false;
  if (rawQuery) {
    const candidates = await searchPublishedPages(effectiveQuery || rawQuery, { limit: 120, categoryPath });
    const ranked = await rankSearchCandidatesWithAi(rawQuery, candidates);
    const byId = new Map(candidates.map((x) => [x.id, x]));
    topResults = ranked.top.map((x) => byId.get(x.id)).filter((x): x is SearchListItem => Boolean(x));
    otherResults = ranked.others.map((x) => byId.get(x.id)).filter((x): x is SearchListItem => Boolean(x));
    noRelevant = ranked.noRelevant;
    aiRankUsed = ranked.aiUsed;
  }

  const baseHref = `/category/${categoryPath}`;

  return (
    <main>
      <div className="page-head">
        <h1 className="page-title">Category: {categoryLabel(categoryPath)}</h1>
        <p className="page-sub">
          {categoryPath} · {result.total} posts
        </p>
        <form method="get" className="search-hero card">
          <input
            type="search"
            name="q"
            defaultValue={rawQuery}
            placeholder="Search in this category..."
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
          {noRelevant ? <section className="grid-list"><div className="card">No relevant review found in this category.</div></section> : null}
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
        {result.items.length === 0 ? (
          <div className="card">No pages in this category yet.</div>
        ) : (
          result.items.map((entry) => (
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

      {!rawQuery && result.totalPages > 1 ? (
        <nav className="pager" aria-label="Category pagination">
          <div className="pager-row">
            <Link className="chip" href={`${baseHref}?page=1${effectiveQuery ? `&q=${encodeURIComponent(rawQuery)}${aiMode ? "&ai=1" : ""}` : ""}`}>
              First
            </Link>
            {result.page > 1 ? (
              <Link className="chip" href={`${baseHref}?page=${result.page - 1}${effectiveQuery ? `&q=${encodeURIComponent(rawQuery)}${aiMode ? "&ai=1" : ""}` : ""}`}>
                Prev
              </Link>
            ) : (
              <span className="chip" aria-disabled>
                Prev
              </span>
            )}
            <span className="chip active">
              Page {result.page} / {result.totalPages}
            </span>
            {result.page < result.totalPages ? (
              <Link className="chip" href={`${baseHref}?page=${result.page + 1}${effectiveQuery ? `&q=${encodeURIComponent(rawQuery)}${aiMode ? "&ai=1" : ""}` : ""}`}>
                Next
              </Link>
            ) : (
              <span className="chip" aria-disabled>
                Next
              </span>
            )}
            <Link className="chip" href={`${baseHref}?page=${result.totalPages}${effectiveQuery ? `&q=${encodeURIComponent(rawQuery)}${aiMode ? "&ai=1" : ""}` : ""}`}>
              Last
            </Link>
          </div>
        </nav>
      ) : null}
    </main>
  );
}

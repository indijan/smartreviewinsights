import Link from "next/link";
import { getLatestPages } from "@/lib/pages";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ page?: string }>;
};

export default async function HomePage({ searchParams }: Props) {
  const { page } = await searchParams;
  const currentPage = Number(page ?? "1");
  const result = await getLatestPages(Number.isFinite(currentPage) ? currentPage : 1, 50);
  const pages = result.items;
  const startPage = Math.max(1, result.page - 3);
  const endPage = Math.min(result.totalPages, result.page + 3);
  const pageWindow = [];
  for (let p = startPage; p <= endPage; p += 1) {
    pageWindow.push(p);
  }

  return (
    <main>
      <div className="page-head">
        <h1 className="page-title">SmartReviewInsights</h1>
      </div>

      <section className="grid-list">
        {pages.length === 0 ? (
          <div className="card">No pages found.</div>
        ) : (
          pages.map((entry) => (
            <article key={entry.id} className="card article-link-card">
              <Link href={`/${entry.slug}`}>
                <h2>{entry.title}</h2>
              </Link>
              {entry.excerpt ? <p className="page-sub">{entry.excerpt}</p> : null}
              <p className="meta">
                {entry.type}
                {entry.publishedAt ? ` · ${new Date(entry.publishedAt).toLocaleDateString()}` : ""}
              </p>
            </article>
          ))
        )}
      </section>

      <nav className="pager" aria-label="Pagination">
        <p className="meta">
          Page {result.page} / {result.totalPages}
        </p>
        <div className="pager-row">
          {result.page > 1 ? (
            <>
              <Link className="chip" href="/?page=1">
                First
              </Link>
              <Link className="chip" href={`/?page=${result.page - 1}`}>
                Prev
              </Link>
            </>
          ) : null}

          {pageWindow.map((p) => (
            <Link key={p} className={`chip${p === result.page ? " active" : ""}`} href={`/?page=${p}`}>
              {p}
            </Link>
          ))}

          {result.page < result.totalPages ? (
            <>
              <Link className="chip" href={`/?page=${result.page + 1}`}>
                Next
              </Link>
              <Link className="chip" href={`/?page=${result.totalPages}`}>
                Last
              </Link>
            </>
          ) : null}
        </div>
      </nav>
    </main>
  );
}

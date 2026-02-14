import Link from "next/link";
import { categoryLabel } from "@/lib/category-taxonomy";
import { getCategoryPages } from "@/lib/pages";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string[] }>; searchParams: Promise<{ page?: string }> };

export default async function CategoryPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { page } = await searchParams;

  const currentPage = Math.max(1, Number(page ?? "1") || 1);
  const result = await getCategoryPages(slug, currentPage, 30);
  const categoryPath = slug.join("/");

  const baseHref = `/category/${categoryPath}`;

  return (
    <main>
      <div className="page-head">
        <h1 className="page-title">Category: {categoryLabel(categoryPath)}</h1>
        <p className="page-sub">
          {categoryPath} · {result.total} posts
        </p>
      </div>

      <section className="grid-list">
        {result.items.length === 0 ? (
          <div className="card">No pages in this category yet.</div>
        ) : (
          result.items.map((entry) => (
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

      {result.totalPages > 1 ? (
        <nav className="pager" aria-label="Category pagination">
          <div className="pager-row">
            <Link className="chip" href={`${baseHref}?page=1`}>
              First
            </Link>
            {result.page > 1 ? (
              <Link className="chip" href={`${baseHref}?page=${result.page - 1}`}>
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
              <Link className="chip" href={`${baseHref}?page=${result.page + 1}`}>
                Next
              </Link>
            ) : (
              <span className="chip" aria-disabled>
                Next
              </span>
            )}
            <Link className="chip" href={`${baseHref}?page=${result.totalPages}`}>
              Last
            </Link>
          </div>
        </nav>
      ) : null}
    </main>
  );
}

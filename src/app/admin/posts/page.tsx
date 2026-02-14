import Link from "next/link";
import { redirect } from "next/navigation";
import ConfirmSubmitButton from "@/components/confirm-submit-button";
import { isAdminSession } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ q?: string; page?: string }>;
};

export default async function AdminPostsPage({ searchParams }: Props) {
  if (!(await isAdminSession())) {
    redirect("/admin/login");
  }

  const { q, page } = await searchParams;
  const query = (q ?? "").trim();
  const currentPage = Math.max(1, Number(page ?? "1") || 1);
  const take = 30;

  const where = query
    ? {
        OR: [
          { title: { contains: query, mode: "insensitive" as const } },
          { slug: { contains: query, mode: "insensitive" as const } },
        ],
      }
    : {};

  const [items, total] = await Promise.all([
    prisma.page.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }],
      skip: (currentPage - 1) * take,
      take,
      select: {
        id: true,
        slug: true,
        title: true,
        status: true,
        type: true,
        updatedAt: true,
      },
    }),
    prisma.page.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / take));

  return (
    <main>
      <div className="page-head">
        <h1 className="page-title">Posts Admin</h1>
        <p className="page-sub">Manage existing posts/pages without terminal access.</p>
      </div>

      <form method="get" className="card" style={{ display: "flex", gap: "0.6rem", alignItems: "center" }}>
        <input
          name="q"
          defaultValue={query}
          placeholder="Search by title or slug"
          style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "0.6rem 0.7rem", flex: 1 }}
        />
        <button className="btn" type="submit">
          Search
        </button>
      </form>

      <section className="grid-list">
        {items.map((item) => (
          <article key={item.id} className="card">
            <h3>{item.title}</h3>
            <p className="meta">/{item.slug}</p>
            <p className="meta">
              {item.type} · {item.status} · updated {new Date(item.updatedAt).toLocaleString()}
            </p>
            <div className="pager-row" style={{ marginTop: "0.6rem" }}>
              {item.status === "PUBLISHED" ? (
                <Link className="chip" href={`/${item.slug}`} target="_blank" rel="noopener noreferrer">
                  Open Live
                </Link>
              ) : (
                <Link className="chip" href={`/admin/posts/${item.id}/preview`} target="_blank" rel="noopener noreferrer">
                  Open Preview
                </Link>
              )}
              <Link className="chip" href={`/admin/posts/${item.id}`}>
                Edit
              </Link>
              <form action={`/admin/posts/${item.id}/delete`} method="post">
                <ConfirmSubmitButton
                  className="chip"
                  type="submit"
                  confirmMessage={`Delete this post permanently?\n\n${item.title}`}
                  style={{ borderColor: "#b91c1c", color: "#b91c1c" }}
                >
                  Delete
                </ConfirmSubmitButton>
              </form>
            </div>
          </article>
        ))}
      </section>

      <div className="pager-row" style={{ marginTop: "1rem" }}>
        {currentPage > 1 ? (
          <Link className="chip" href={`/admin/posts?page=${currentPage - 1}&q=${encodeURIComponent(query)}`}>
            Prev
          </Link>
        ) : null}
        <span className="chip active">
          Page {currentPage} / {totalPages}
        </span>
        {currentPage < totalPages ? (
          <Link className="chip" href={`/admin/posts?page=${currentPage + 1}&q=${encodeURIComponent(query)}`}>
            Next
          </Link>
        ) : null}
      </div>
    </main>
  );
}

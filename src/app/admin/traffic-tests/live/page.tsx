import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdminSession } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function LiveTrafficTestsPage() {
  if (!(await isAdminSession())) redirect("/admin/login");

  const pages = await prisma.page.findMany({
    where: {
      status: "PUBLISHED",
      OR: [
        { slug: { startsWith: "insights/" } },
        { slug: { startsWith: "guides/" } },
        { slug: { startsWith: "next/" } },
      ],
    },
    orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
    take: 100,
    select: {
      id: true,
      slug: true,
      title: true,
      type: true,
      publishedAt: true,
    },
  });

  return (
    <main>
      <div className="page-head">
        <h1 className="page-title">Live Traffic Tests</h1>
        <p className="page-sub">Published attention-test pages currently live on the site.</p>
      </div>

      <section className="card">
        <div style={{ display: "grid", gap: "0.75rem" }}>
          {pages.length === 0 ? (
            <p className="meta">No live traffic tests yet.</p>
          ) : pages.map((page) => (
            <div key={page.id} className="card">
              <p><strong>{page.title}</strong></p>
              <p className="meta">
                {page.slug} · {page.type}
                {page.publishedAt ? ` · ${new Date(page.publishedAt).toLocaleDateString()}` : ""}
              </p>
              <div className="pager-row" style={{ marginTop: "0.6rem" }}>
                <Link className="chip" href={`/admin/posts/${page.id}`}>Edit</Link>
                <Link className="chip" href={`/${page.slug}`} target="_blank" rel="noopener noreferrer">Open Public</Link>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import ConfirmSubmitButton from "@/components/confirm-submit-button";
import { isAdminSession } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function AdminPostEditPage({ params }: Props) {
  if (!(await isAdminSession())) {
    redirect("/admin/login");
  }

  const { id } = await params;
  const page = await prisma.page.findUnique({
    where: { id },
    select: {
      id: true,
      slug: true,
      title: true,
      excerpt: true,
      contentMd: true,
      status: true,
      type: true,
    },
  });

  if (!page) notFound();

  return (
    <main>
      <div className="page-head">
        <h1 className="page-title">Edit Post</h1>
        <p className="page-sub">{page.slug}</p>
      </div>

      <form action={`/admin/posts/${page.id}/save`} method="post" className="card" style={{ display: "grid", gap: "0.7rem" }}>
        <label>
          <strong>Title</strong>
          <input
            name="title"
            defaultValue={page.title}
            required
            style={{ marginTop: 6, width: "100%", border: "1px solid var(--border)", borderRadius: 10, padding: "0.6rem 0.7rem" }}
          />
        </label>

        <label>
          <strong>Slug</strong>
          <input
            name="slug"
            defaultValue={page.slug}
            required
            style={{ marginTop: 6, width: "100%", border: "1px solid var(--border)", borderRadius: 10, padding: "0.6rem 0.7rem" }}
          />
        </label>

        <label>
          <strong>Status</strong>
          <select
            name="status"
            defaultValue={page.status}
            style={{ marginTop: 6, width: 220, border: "1px solid var(--border)", borderRadius: 10, padding: "0.6rem 0.7rem" }}
          >
            <option value="DRAFT">DRAFT</option>
            <option value="PUBLISHED">PUBLISHED</option>
          </select>
        </label>

        <label>
          <strong>Excerpt</strong>
          <textarea
            name="excerpt"
            defaultValue={page.excerpt ?? ""}
            rows={3}
            style={{ marginTop: 6, width: "100%", border: "1px solid var(--border)", borderRadius: 10, padding: "0.6rem 0.7rem" }}
          />
        </label>

        <label>
          <strong>Content (Markdown)</strong>
          <textarea
            name="contentMd"
            defaultValue={page.contentMd}
            rows={20}
            required
            style={{ marginTop: 6, width: "100%", border: "1px solid var(--border)", borderRadius: 10, padding: "0.7rem", fontFamily: "ui-monospace, Menlo, Monaco, monospace" }}
          />
        </label>

        <div className="pager-row">
          <ConfirmSubmitButton className="btn" type="submit" confirmMessage="Save all modifications for this post?">
            Save Changes
          </ConfirmSubmitButton>
          <Link className="chip" href={`/admin/posts`}>
            Back
          </Link>
          <Link className="chip" href={`/admin/posts/${page.id}/preview`} target="_blank" rel="noopener noreferrer">
            Open Preview
          </Link>
          {page.status === "PUBLISHED" ? (
            <Link className="chip" href={`/${page.slug}`} target="_blank" rel="noopener noreferrer">
              Open Live
            </Link>
          ) : null}
        </div>
      </form>

      <form action={`/admin/posts/${page.id}/delete`} method="post" style={{ marginTop: "1rem" }}>
        <ConfirmSubmitButton
          className="chip"
          type="submit"
          confirmMessage={`Delete this post permanently?\n\n${page.title}`}
          style={{ borderColor: "#b91c1c", color: "#b91c1c" }}
        >
          Delete Post
        </ConfirmSubmitButton>
      </form>
    </main>
  );
}

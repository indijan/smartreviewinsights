import Link from "next/link";
import { redirect } from "next/navigation";
import CopyField from "@/components/copy-field";
import { isAdminSession } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{
    ids?: string;
    hook?: string;
    cluster?: string;
    mode?: string;
  }>;
};

export default async function TrafficTestResultPage({ searchParams }: Props) {
  if (!(await isAdminSession())) redirect("/admin/login");

  const { ids, hook, cluster, mode } = await searchParams;
  const idList = String(ids || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const pages = idList.length
    ? await prisma.page.findMany({
        where: { id: { in: idList } },
        select: { id: true, slug: true, title: true, status: true, type: true },
      })
    : [];

  const orderedPages = idList
    .map((id) => pages.find((page) => page.id === id))
    .filter((page): page is NonNullable<typeof page> => Boolean(page));
  const entryPage = orderedPages.find((page) => page.slug.startsWith("insights/")) ?? null;
  const utmCampaign = `${cluster || "traffic-test"}-${mode === "published" ? "live" : "draft"}`.replace(/[^a-z0-9-]+/gi, "-").toLowerCase();
  const entryUrl = entryPage ? `https://smartreviewinsights.com/${entryPage.slug}` : "";
  const entryUrlWithUtm = entryPage
    ? `https://smartreviewinsights.com/${entryPage.slug}?utm_source=clickboom&utm_medium=paid&utm_campaign=${encodeURIComponent(utmCampaign)}&utm_content=entry_a`
    : "";

  return (
    <main>
      <div className="page-head">
        <h1 className="page-title">Traffic Test Generated</h1>
        <p className="page-sub">
          {mode === "published" ? "The page pack is live." : "The page pack is saved as draft."}
        </p>
      </div>

      <section className="card">
        <h2>Hypothesis Summary</h2>
        <div style={{ display: "grid", gap: "0.45rem", marginTop: "0.8rem" }}>
          <p><strong>Cluster:</strong> {cluster || "n/a"}</p>
          <p><strong>Hook:</strong> {hook || "n/a"}</p>
          <p><strong>Status:</strong> {mode === "published" ? "Published immediately" : "Draft only"}</p>
        </div>
      </section>

      <section className="card" style={{ marginTop: "1rem" }}>
        <h2>Send Traffic Here First</h2>
        {entryPage ? (
          <div style={{ display: "grid", gap: "0.45rem", marginTop: "0.8rem" }}>
            <p><strong>{entryPage.title}</strong></p>
            <p className="meta">{entryPage.slug}</p>
            <div className="pager-row">
              <Link className="btn" href={`/${entryPage.slug}`} target="_blank" rel="noopener noreferrer">
                Open Entry Page
              </Link>
              <Link className="chip" href={`/admin/posts/${entryPage.id}`}>
                Edit Entry Page
              </Link>
            </div>
          </div>
        ) : (
          <p className="meta" style={{ marginTop: "0.8rem" }}>No entry page found in this generated pack.</p>
        )}
      </section>

      {entryPage ? (
        <section className="card" style={{ marginTop: "1rem" }}>
          <h2>Traffic Launch Pack</h2>
          <div style={{ display: "grid", gap: "0.9rem", marginTop: "0.8rem" }}>
            <CopyField label="Entry URL" value={entryUrl} />
            <CopyField label="Entry URL With UTM" value={entryUrlWithUtm} />
            <CopyField label="Suggested UTM Campaign" value={utmCampaign} />
          </div>
        </section>
      ) : null}

      <section className="card" style={{ marginTop: "1rem" }}>
        <h2>Generated Pages</h2>
        <div style={{ display: "grid", gap: "0.8rem", marginTop: "0.8rem" }}>
          {orderedPages.map((page) => (
            <div key={page.id} className="card">
              <p><strong>{page.title}</strong></p>
              <p className="meta">{page.slug} · {page.type} · {page.status}</p>
              <div className="pager-row" style={{ marginTop: "0.6rem" }}>
                <Link className="chip" href={`/admin/posts/${page.id}`}>Edit</Link>
                <Link className="chip" href={`/${page.slug}`} target="_blank" rel="noopener noreferrer">
                  Open Public
                </Link>
              </div>
            </div>
          ))}
          {orderedPages.length === 0 ? <p className="meta">No generated pages found.</p> : null}
        </div>
      </section>

      <section className="card" style={{ marginTop: "1rem" }}>
        <h2>Next Move</h2>
        <div style={{ display: "grid", gap: "0.45rem", marginTop: "0.8rem" }}>
          <p>1. Put paid traffic on the `insights/...` entry page first.</p>
          <p>2. Watch exit CTR and visitor value on the dashboard.</p>
          <p>3. Kill the test fast if cost outruns value.</p>
        </div>
      </section>
    </main>
  );
}

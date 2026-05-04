import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isAdminSession } from "@/lib/admin";
import { getOpportunityDetail } from "@/lib/analytics";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ days?: string; site?: string }>;
};

export default async function OpportunityDetailPage({ params, searchParams }: Props) {
  if (!(await isAdminSession())) {
    redirect("/admin/login");
  }

  const { id } = await params;
  const { days, site } = await searchParams;
  const period = [7, 30, 90].includes(Number(days)) ? Number(days) : 30;
  const detail = await getOpportunityDetail(id, period, site ?? null);

  if (!detail) notFound();

  return (
    <main>
      <div className="page-head">
        <h1 className="page-title">Opportunity Detail</h1>
        <p className="page-sub">{detail.title}</p>
        <div className="pager-row" style={{ marginTop: "0.8rem" }}>
          <Link className="chip" href={`/admin/opportunities?days=${period}${site ? `&site=${encodeURIComponent(site)}` : ""}`}>Back To Ranking</Link>
          <Link className="chip" href={`/${detail.slug}`} target="_blank" rel="noopener noreferrer">Open Public</Link>
          <Link className="chip" href={`/admin/posts/${detail.id}`}>Edit Page</Link>
        </div>
      </div>

      <section className="card">
        <h2>Opportunity Snapshot</h2>
        <div style={{ display: "grid", gap: "0.4rem", marginTop: "0.8rem" }}>
          <p><strong>Slug:</strong> {detail.slug}</p>
          <p><strong>Type:</strong> {detail.type}</p>
          <p><strong>Category:</strong> {detail.category ?? "no category"}</p>
          <p><strong>Tracked clicks ({period}d):</strong> {detail.clicks}</p>
          <p><strong>Opportunity score:</strong> {detail.opportunityScore}</p>
          <p><strong>Query intent score:</strong> {detail.queryIntentScore}</p>
          <p><strong>Recommendation:</strong> {detail.recommendation}</p>
          <p><strong>Confidence:</strong> {detail.confidence}</p>
          <p><strong>Exit Layer:</strong> {detail.activeExitLayer ? "ACTIVE" : "NOT ACTIVE"}</p>
          <p><strong>GSC Overlay:</strong> {detail.selectedSite ? "live" : "pending"}</p>
        </div>
      </section>

      <section className="card" style={{ marginTop: "1rem" }}>
        <h2>Search Console Readiness</h2>
        <div style={{ display: "grid", gap: "0.4rem", marginTop: "0.8rem" }}>
          <p><strong>Selected site:</strong> {detail.selectedSite ?? "pending"}</p>
          <p><strong>Organic clicks:</strong> {detail.gscClicks ?? "pending"}</p>
          <p><strong>Impressions:</strong> {detail.gscImpressions ?? "pending"}</p>
          <p><strong>CTR:</strong> {detail.gscCtr ?? "pending"}</p>
          <p><strong>Avg position:</strong> {detail.gscPosition ?? "pending"}</p>
        </div>
      </section>

      <section id="activate-exit-layer" className="card" style={{ marginTop: "1rem" }}>
        <h2>Activate Exit Layer</h2>
        <form action={`/admin/opportunities/${detail.id}/activate`} method="post" style={{ display: "grid", gap: "0.7rem", marginTop: "0.8rem" }}>
          <input type="hidden" name="days" value={String(period)} />
          <input type="hidden" name="site" value={site ?? ""} />
          <label>
            <strong>Outbound URL</strong>
            <input
              name="outboundUrl"
              type="url"
              required
              placeholder="https://example.com/next-step"
              style={{ marginTop: 6, width: "100%", border: "1px solid var(--border)", borderRadius: 10, padding: "0.65rem 0.75rem" }}
            />
          </label>
          <label>
            <strong>CTA Label</strong>
            <input
              name="label"
              defaultValue="See Recommended Options"
              style={{ marginTop: 6, width: "100%", border: "1px solid var(--border)", borderRadius: 10, padding: "0.65rem 0.75rem" }}
            />
          </label>
          <div style={{ display: "grid", gap: "0.45rem" }}>
            <strong>Slots To Activate</strong>
            <label style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" name="slots" value="MID_ARTICLE" defaultChecked />
              <span>Mid Article</span>
            </label>
            <label style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" name="slots" value="BOTTOM_EXIT" defaultChecked />
              <span>Bottom Exit</span>
            </label>
            <label style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" name="slots" value="MOBILE_STICKY" />
              <span>Mobile Sticky</span>
            </label>
          </div>
          <button className="btn" type="submit">
            {detail.activeExitLayer ? "Refresh Exit Layer" : "Activate Exit Layer"}
          </button>
        </form>
      </section>

      <section className="card" style={{ marginTop: "1rem" }}>
        <h2>Top Organic Queries For This Page</h2>
        <div style={{ display: "grid", gap: "0.65rem", marginTop: "0.8rem" }}>
          {detail.topQueries.length === 0 ? (
            <p className="meta">No query data yet for this page.</p>
          ) : detail.topQueries.map((query) => (
            <div key={query.key} className="card">
              <p><strong>{query.key}</strong></p>
              <p className="meta">
                {query.clicks} clicks · {query.impressions} impressions · CTR {query.ctr.toFixed(3)} · position {query.position.toFixed(1)}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="card" style={{ marginTop: "1rem" }}>
        <h2>Active Exit Placements</h2>
        <div style={{ display: "grid", gap: "0.8rem", marginTop: "0.8rem" }}>
          {detail.activePlacements.length === 0 ? (
            <p className="meta">No active exit placements on this page yet.</p>
          ) : detail.activePlacements.map((placement) => (
            <div key={placement.id} className="card">
              <p><strong>{placement.name}</strong></p>
              <p className="meta">{placement.slug} · {placement.placementType} · weight {placement.weight}</p>
              <p style={{ marginTop: "0.35rem" }}>Offer: <strong>{placement.offerName}</strong> ({placement.offerSlug})</p>
              <p className="meta">{placement.destinationUrl}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="card" style={{ marginTop: "1rem" }}>
        <h2>Recommended Exit Placement Plan</h2>
        <div style={{ display: "grid", gap: "0.8rem", marginTop: "0.8rem" }}>
          {detail.placementPlan.map((item) => (
            <div key={item.slot} className="card">
              <p><strong>{item.slot}</strong> · {item.priority}</p>
              <p className="page-sub" style={{ marginTop: "0.35rem" }}>{item.rationale}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="card" style={{ marginTop: "1rem" }}>
        <h2>Daily Tracked Clicks</h2>
        <div style={{ display: "grid", gap: "0.45rem", marginTop: "0.8rem" }}>
          {detail.dailyClicks.length === 0 ? (
            <p className="meta">No tracked clicks in this period.</p>
          ) : detail.dailyClicks.map((row) => (
            <p key={row.day}>{row.day}: {row.clicks}</p>
          ))}
        </div>
      </section>
    </main>
  );
}

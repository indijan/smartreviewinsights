import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdminSession } from "@/lib/admin";
import { getTopOpportunityPages } from "@/lib/analytics";
import { getSearchConsoleAudit, hasSearchConsoleConnection } from "@/lib/search-console";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ days?: string; site?: string; filter?: string; gscConnected?: string; gscDisconnected?: string; gscError?: string }>;
};

export default async function AdminOpportunitiesPage({ searchParams }: Props) {
  if (!(await isAdminSession())) {
    redirect("/admin/login");
  }

  const { days, site, filter, gscConnected, gscDisconnected, gscError } = await searchParams;
  const period = [7, 30, 90].includes(Number(days)) ? Number(days) : 30;
  const exitFilter = filter === "active" || filter === "inactive" ? filter : "all";
  const connected = await hasSearchConsoleConnection();
  const [pages, gscAudit] = await Promise.all([
    getTopOpportunityPages(period, 30, site ?? null, exitFilter),
    connected ? getSearchConsoleAudit(site ?? null, period).catch(() => null) : Promise.resolve(null),
  ]);

  return (
    <main>
      <div className="page-head">
        <h1 className="page-title">Top Opportunity</h1>
        <p className="page-sub">
          Analytics-first ranking of existing published pages that look strongest for future exit-point activation.
        </p>
        <div className="pager-row" style={{ marginTop: "0.8rem" }}>
          {[7, 30, 90].map((d) => (
            <Link
              key={d}
              className={`chip${d === period ? " active" : ""}`}
              href={`/admin/opportunities?days=${d}${site ? `&site=${encodeURIComponent(site)}` : ""}${exitFilter !== "all" ? `&filter=${exitFilter}` : ""}`}
            >
              {d}d
            </Link>
          ))}
          <Link className="chip" href={`/admin/opportunities/queries?days=${period}${site ? `&site=${encodeURIComponent(site)}` : ""}`}>
            Top Queries
          </Link>
        </div>
      </div>

      <section className="card">
        <h2>Search Console</h2>
        <div style={{ display: "grid", gap: "0.55rem", marginTop: "0.8rem" }}>
          <p>
            <strong>Status:</strong> {connected ? "connected" : "not connected"}
          </p>
          {gscConnected ? <p className="meta">Search Console connected successfully.</p> : null}
          {gscDisconnected ? <p className="meta">Search Console disconnected.</p> : null}
          {gscError ? <p className="meta">Connection error: {gscError}</p> : null}
          {connected ? (
            <>
              <p><strong>Selected site:</strong> {gscAudit?.selectedSite ?? "pending"}</p>
              <div className="pager-row">
                {(gscAudit?.sites ?? []).map((item) => (
                  <Link
                    key={item.siteUrl}
                    className={`chip${item.siteUrl === gscAudit?.selectedSite ? " active" : ""}`}
                    href={`/admin/opportunities?days=${period}&site=${encodeURIComponent(item.siteUrl)}`}
                  >
                    {item.siteUrl}
                  </Link>
                ))}
              </div>
              <form action="/api/search-console/disconnect" method="post">
                <button className="chip" type="submit">Disconnect Search Console</button>
              </form>
            </>
          ) : (
            <Link className="chip" href={`/api/search-console/connect?returnTo=${encodeURIComponent(`/admin/opportunities?days=${period}`)}`}>
              Connect Search Console
            </Link>
          )}
        </div>
      </section>

      <section className="card" style={{ marginTop: "1rem" }}>
        <h2>How To Read This</h2>
        <div style={{ display: "grid", gap: "0.45rem", marginTop: "0.8rem" }}>
          <p><strong>DOUBLE_DOWN</strong> = already strong page, best candidate for adding or strengthening exit points.</p>
          <p><strong>PLACE_EXIT</strong> = good candidate, likely worth testing a first click-out layer.</p>
          <p><strong>WATCH</strong> = visible but weaker candidate, not first priority.</p>
          <p className="meta">
            Confidence is `analytics-only` until a page picks up Search Console page data. Then it upgrades to `hybrid`.
          </p>
        </div>
      </section>

      <section className="card" style={{ marginTop: "1rem" }}>
        <h2>Ranked Pages</h2>
        <div className="pager-row" style={{ marginTop: "0.8rem" }}>
          {[
            { label: "All", value: "all" },
            { label: "No Exit Yet", value: "inactive" },
            { label: "Exit Active", value: "active" },
          ].map((item) => (
            <Link
              key={item.value}
              className={`chip${exitFilter === item.value ? " active" : ""}`}
              href={`/admin/opportunities?days=${period}${site ? `&site=${encodeURIComponent(site)}` : ""}${item.value !== "all" ? `&filter=${item.value}` : ""}`}
            >
              {item.label}
            </Link>
          ))}
        </div>
        <div style={{ display: "grid", gap: "0.9rem", marginTop: "0.8rem" }}>
          {pages.length === 0 ? (
            <p className="meta">No opportunity pages found yet.</p>
          ) : pages.map((page) => (
            <div key={page.id} className="card">
              <p><strong>{page.title}</strong></p>
              <p className="meta">
                {page.slug} · {page.type} · {page.category ?? "no category"} · {page.clicks} tracked clicks · updated {page.freshnessDays}d ago
              </p>
              <div style={{ display: "grid", gap: "0.3rem", marginTop: "0.5rem" }}>
                <p>Opportunity Score: <strong>{page.opportunityScore}</strong></p>
                <p>Recommendation: <strong>{page.recommendation}</strong></p>
                <p>Confidence: <strong>{page.confidence}</strong></p>
                <p>Exit Layer: <strong>{page.activeExitLayer ? "active" : "inactive"}</strong></p>
                <p>Query Intent: <strong>{page.queryIntentScore}</strong></p>
                <p>GSC: <strong>{page.gscClicks ?? "pending"}</strong> clicks · <strong>{page.gscImpressions ?? "pending"}</strong> impressions · position <strong>{page.gscPosition ?? "pending"}</strong></p>
              </div>
              <div className="pager-row" style={{ marginTop: "0.7rem" }}>
                <Link className="chip" href={`/${page.slug}`} target="_blank" rel="noopener noreferrer">
                  Open Public
                </Link>
                <Link className="chip" href={`/admin/opportunities/${page.id}?days=${period}${site ? `&site=${encodeURIComponent(site)}` : ""}`}>
                  Opportunity Detail
                </Link>
                <Link className="chip" href={`/admin/posts/${page.id}`}>
                  Edit
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdminSession } from "@/lib/admin";
import { getTopOpportunityQueries } from "@/lib/analytics";
import { hasSearchConsoleConnection } from "@/lib/search-console";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ days?: string; site?: string }>;
};

export default async function OpportunityQueriesPage({ searchParams }: Props) {
  if (!(await isAdminSession())) {
    redirect("/admin/login");
  }

  const { days, site } = await searchParams;
  const period = [7, 30, 90].includes(Number(days)) ? Number(days) : 30;
  const connected = await hasSearchConsoleConnection();
  const queries = connected ? await getTopOpportunityQueries(period, site ?? null, 40) : [];

  return (
    <main>
      <div className="page-head">
        <h1 className="page-title">Top Queries</h1>
        <p className="page-sub">
          Search Console query view for opportunity discovery. This is where intent quality shows up more clearly than page clicks alone.
        </p>
        <div className="pager-row" style={{ marginTop: "0.8rem" }}>
          <Link className="chip" href={`/admin/opportunities?days=${period}${site ? `&site=${encodeURIComponent(site)}` : ""}`}>Back To Pages</Link>
          {[7, 30, 90].map((d) => (
            <Link
              key={d}
              className={`chip${d === period ? " active" : ""}`}
              href={`/admin/opportunities/queries?days=${d}${site ? `&site=${encodeURIComponent(site)}` : ""}`}
            >
              {d}d
            </Link>
          ))}
        </div>
      </div>

      <section className="card">
        {!connected ? (
          <p className="meta">Connect Search Console first from the Top Opportunity page.</p>
        ) : (
          <div style={{ display: "grid", gap: "0.9rem" }}>
            {queries.length === 0 ? (
              <p className="meta">No query data yet for this site and window.</p>
            ) : queries.map((query) => (
              <div key={query.query} className="card">
                <p><strong>{query.query}</strong></p>
                <p className="meta">
                  {query.clicks} clicks · {query.impressions} impressions · CTR {query.ctr.toFixed(3)} · position {query.position.toFixed(1)}
                </p>
                <div style={{ display: "grid", gap: "0.3rem", marginTop: "0.45rem" }}>
                  <p>Intent Score: <strong>{query.intentScore}</strong></p>
                  <p>Recommendation: <strong>{query.recommendation}</strong></p>
                  <p>
                    Matched Page: <strong>{query.pageTitle ?? "unmatched"}</strong>
                    {query.pageSlug ? ` · ${query.pageSlug}` : ""}
                    {query.pageCategory ? ` · ${query.pageCategory}` : ""}
                  </p>
                </div>
                <div className="pager-row" style={{ marginTop: "0.6rem" }}>
                  {query.pageId ? (
                    <Link className="chip" href={`/admin/opportunities/${query.pageId}?days=${period}${site ? `&site=${encodeURIComponent(site)}` : ""}`}>
                      Open Opportunity
                    </Link>
                  ) : null}
                  {query.pageId ? (
                    <Link className="chip" href={`/admin/opportunities/${query.pageId}?days=${period}${site ? `&site=${encodeURIComponent(site)}` : ""}#activate-exit-layer`}>
                      Activate Exit Plan
                    </Link>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

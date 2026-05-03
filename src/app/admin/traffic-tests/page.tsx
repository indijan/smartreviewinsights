import Link from "next/link";
import { redirect } from "next/navigation";
import TrafficTestPresets from "@/components/traffic-test-presets";
import { isAdminSession } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { TRAFFIC_TEST_PRESETS } from "@/lib/traffic-tests";

export const dynamic = "force-dynamic";

export default async function TrafficTestsPage() {
  if (!(await isAdminSession())) redirect("/admin/login");

  const recentPages = await prisma.page.findMany({
    where: {
      OR: [
        { slug: { startsWith: "insights/" } },
        { slug: { startsWith: "guides/" } },
        { slug: { startsWith: "next/" } },
      ],
    },
    orderBy: [{ createdAt: "desc" }],
    take: 18,
    select: { id: true, slug: true, title: true, status: true, type: true, createdAt: true },
  });

  return (
    <main>
      <div className="page-head">
        <h1 className="page-title">Traffic Tests</h1>
        <p className="page-sub">
          Prompt in. Domain-fit arbitrage hypothesis out. The system drafts an entry page, a bridge page, and an exit page.
        </p>
        <div className="pager-row" style={{ marginTop: "0.8rem" }}>
          <Link className="chip" href="/admin/traffic-tests/live">Live Tests</Link>
        </div>
      </div>

      <section className="card" style={{ marginBottom: "1rem" }}>
        <h2>Prompt Presets</h2>
        <TrafficTestPresets presets={TRAFFIC_TEST_PRESETS} targetId="traffic-test-prompt" />
        <p className="meta" style={{ marginTop: "0.7rem" }}>
          Click a preset, then paste or edit its idea in the prompt box below.
        </p>
      </section>

      <form action="/admin/traffic-tests/generate" method="post" className="card" style={{ display: "grid", gap: "0.8rem" }}>
        <label>
          <strong>Prompt</strong>
          <textarea
            id="traffic-test-prompt"
            name="prompt"
            rows={5}
            required
            placeholder="Find a SmartReviewInsights-adjacent cheap-click topic around sleep, home comfort, pets, or consumer mistakes where curiosity traffic can be bought cheaply and pushed toward a click exit."
            style={{ marginTop: 6, width: "100%", border: "1px solid var(--border)", borderRadius: 10, padding: "0.75rem" }}
          />
        </label>

        <div className="pager-row">
          <label style={{ display: "grid", gap: 6 }}>
            <strong>Geo</strong>
            <select name="geo" defaultValue="US">
              <option value="US">US</option>
              <option value="AU">AU</option>
              <option value="NZ">NZ</option>
              <option value="CA">CA</option>
              <option value="UK">UK</option>
            </select>
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <strong>Daily budget (USD)</strong>
            <input name="budgetUsd" type="number" min="5" step="1" defaultValue="20" />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <strong>Risk mode</strong>
            <select name="riskMode" defaultValue="balanced">
              <option value="safe">safe</option>
              <option value="balanced">balanced</option>
              <option value="aggressive">aggressive</option>
            </select>
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <strong>Monetization</strong>
            <select name="monetizationMode" defaultValue="display_plus_outbound">
              <option value="display_plus_outbound">display + outbound</option>
              <option value="display_ads">display ads only</option>
            </select>
          </label>
        </div>

        <label>
          <strong>Outbound URL</strong>
          <input
            name="outboundUrl"
            type="url"
            placeholder="https://example.com/next-step"
            style={{ marginTop: 6, width: "100%", border: "1px solid var(--border)", borderRadius: 10, padding: "0.75rem" }}
          />
          <span className="meta">Optional, but needed if you want the generated exit page to send traffic off-site immediately.</span>
        </label>

        <label style={{ display: "flex", gap: "0.6rem", alignItems: "center" }}>
          <input name="publishNow" type="checkbox" value="1" />
          <span><strong>Publish immediately</strong> instead of saving draft pages only.</span>
        </label>

        <button className="btn" type="submit">Generate Test Pack</button>
      </form>

      <section className="card" style={{ marginTop: "1rem" }}>
        <h2>How public pages will look</h2>
        <div style={{ display: "grid", gap: "0.5rem", marginTop: "0.8rem" }}>
          <p><strong>`insights/...`</strong> = entry page with a problem-first hook.</p>
          <p><strong>`guides/...`</strong> = bridge page that stretches attention and adds context.</p>
          <p><strong>`next/...`</strong> = short exit page built to trigger the outbound click.</p>
        </div>
      </section>

      <section className="card" style={{ marginTop: "1rem" }}>
        <h2>Recent Generated Pages</h2>
        <div style={{ display: "grid", gap: "0.6rem", marginTop: "0.8rem" }}>
          {recentPages.length === 0 ? (
            <p className="meta">No generated traffic tests yet.</p>
          ) : recentPages.map((page) => (
            <p key={page.id}>
              <Link href={`/admin/posts/${page.id}`}>{page.title}</Link> · {page.slug} · {page.type} · {page.status}
            </p>
          ))}
        </div>
      </section>
    </main>
  );
}

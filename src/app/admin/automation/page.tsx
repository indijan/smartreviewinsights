import Link from "next/link";
import { redirect } from "next/navigation";
import { ensureDefaultNichesForSource } from "@/lib/automation-niches";
import { isAdminSession } from "@/lib/admin";
import { CATEGORY_TAXONOMY, categoryAutomationNodes, categoryLabel } from "@/lib/category-taxonomy";
import type { OfferSource } from "@/lib/offer-source";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const SOURCE: OfferSource = "AMAZON";

function parentLabel(path: string) {
  const parent = CATEGORY_TAXONOMY.find((root) => path === root.path || path.startsWith(`${root.path}/`));
  return parent?.label || "-";
}

export default async function AdminAutomationPage() {
  if (!(await isAdminSession())) {
    redirect("/admin/login");
  }

  const config = await prisma.automationConfig.findFirst({ orderBy: { updatedAt: "desc" } });
  const currentSource = SOURCE;

  await ensureDefaultNichesForSource(currentSource);

  const [runs, niches] = await Promise.all([
    prisma.automationRun.findMany({ orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.automationNiche.findMany({ where: { source: currentSource }, orderBy: [{ priority: "asc" }, { categoryPath: "asc" }] }),
  ]);
  const [lastCronAutopost, lastCronBackcheck] = await Promise.all([
    prisma.automationRun.findFirst({
      where: { source: "AMAZON", message: { contains: "Cron autopost" } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.automationRun.findFirst({
      where: { source: "AMAZON", message: { contains: "Monthly price backcheck" } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const nicheMap = new Map(niches.map((n) => [n.categoryPath, n]));
  const automationNodes = categoryAutomationNodes();
  const openAiConfigured = Boolean(process.env.OPENAI_API_KEY);
  const cronSecretConfigured = Boolean(process.env.CRON_SECRET);

  return (
    <main>
      <div className="page-head">
        <h1 className="page-title">Automation Pipeline</h1>
        <p className="page-sub">Niche selection → Amazon CSE → AI rewrite → competitor offers → draft/published post creation.</p>
        <p className="meta">Primary source: AMAZON. Competitor scan: ALIEXPRESS, TEMU, ALIBABA, EBAY.</p>
        <p style={{ marginTop: 8 }}>
          <Link className="chip" href="/admin/automation/insights">
            Open Automation Insights
          </Link>
        </p>
      </div>

      <section className="card" style={{ marginBottom: "1rem" }}>
        <h2>Scheduled Automation (Vercel Cron)</h2>
        <p className="page-sub">Autopost schedule: every 6 hours (4 posts/day total, 1 post per run, weighted by Top Pages).</p>
        <p className="page-sub">Monthly price backcheck: day 1 at 03:15 (server time).</p>
        <p className="meta">
          CRON_SECRET: {cronSecretConfigured ? "configured" : "missing"} · OPENAI_API_KEY: {openAiConfigured ? "configured" : "missing"}
        </p>
        <div style={{ marginTop: "0.7rem", display: "grid", gap: "0.5rem" }}>
          <p className="meta">
            Last autopost run:{" "}
            {lastCronAutopost
              ? `${new Date(lastCronAutopost.startedAt).toLocaleString()} · ${lastCronAutopost.status} · posted=${lastCronAutopost.itemsPosted}`
              : "no cron autopost run yet"}
          </p>
          <p className="meta">
            Last monthly backcheck:{" "}
            {lastCronBackcheck
              ? `${new Date(lastCronBackcheck.startedAt).toLocaleString()} · ${lastCronBackcheck.status} · updated=${lastCronBackcheck.itemsPosted}`
              : "no monthly backcheck run yet"}
          </p>
        </div>
        <div style={{ marginTop: "0.9rem", display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
          <form action="/admin/automation/cron/autopost-now" method="post">
            <button className="btn" type="submit">Run Autopost Now</button>
          </form>
          <form action="/admin/automation/cron/backcheck-now" method="post">
            <button className="btn" type="submit">Run Monthly Backcheck Now</button>
          </form>
        </div>
      </section>

      <form action="/admin/automation/save" method="post" className="card" style={{ display: "grid", gap: "0.7rem" }}>
        <input type="hidden" name="source" value={SOURCE} />

        <section className="card">
          <h2>Pipeline Rules</h2>
          <p className="page-sub">Every generated post is tied to a product and has at least one offer. No empty posts and no orphan offers.</p>
          <p className="meta">Niche `Max items` = requested post count per niche (db/niche).</p>
        </section>

        <label>
          <input type="checkbox" name="isEnabled" defaultChecked={config?.isEnabled ?? true} /> Enable automation
        </label>
        <label>
          <input type="checkbox" name="autoPostEnabled" defaultChecked={config?.autoPostEnabled ?? true} /> Auto post enabled
        </label>
        <label>
          <input type="checkbox" name="aiRewriteEnabled" defaultChecked={config?.aiRewriteEnabled ?? false} /> AI rewrite enabled
          <span className="meta" style={{ marginLeft: 8 }}>
            {openAiConfigured ? "OPENAI_API_KEY detected" : "OPENAI_API_KEY missing -> fallback text will be used"}
          </span>
        </label>

        <label>
          <strong>Publish Mode</strong>
          <select name="publishMode" defaultValue={config?.publishMode ?? "DRAFT"} style={{ marginLeft: 8 }}>
            <option value="DRAFT">DRAFT</option>
            <option value="PUBLISHED">PUBLISHED</option>
          </select>
        </label>

        <label>
          <strong>AI Rewrite Instructions</strong>
          <textarea
            name="promptTemplate"
            rows={6}
            defaultValue={config?.promptTemplate ?? ""}
            placeholder="Example: Write a practical buying guide in English, include pros/cons, avoid hype, keep factual tone."
            style={{ marginTop: 6, width: "100%", border: "1px solid var(--border)", borderRadius: 10, padding: "0.6rem 0.7rem" }}
          />
        </label>

        <section className="card" style={{ marginTop: "0.8rem" }}>
          <h2>{currentSource} Niche Settings</h2>
          <p className="page-sub">Choose exactly which niches should generate new posts and how many posts per niche.</p>
          <p className="meta">
            `Search Query` mezőbe írhatsz kulcsszót (pl. `smart home door lock`) VAGY teljes Amazon keresési URL-t.
          </p>
          <div
            style={{
              marginTop: "0.8rem",
              display: "grid",
              gap: "0.4rem",
              gridTemplateColumns: "minmax(130px, 1fr) minmax(230px, 1.2fr) 2fr 90px auto",
              alignItems: "center",
              fontWeight: 700,
            }}
          >
            <span>Parent</span>
            <span>Niche</span>
            <span>Search Query (keyword or Amazon URL)</span>
            <span>Posts</span>
            <span>Enabled</span>
          </div>
          <div style={{ marginTop: "0.8rem", display: "grid", gap: "0.55rem" }}>
            {automationNodes.map((node, index) => {
              const n = nicheMap.get(node.path) as
                | { priority?: number; keywords?: string; maxItems?: number; isEnabled?: boolean }
                | undefined;
              const isChild = node.path.includes("/");
              return (
                <div
                  key={node.path}
                  style={{
                    display: "grid",
                    gap: "0.4rem",
                    gridTemplateColumns: "minmax(130px, 1fr) minmax(230px, 1.2fr) 2fr 90px auto",
                    alignItems: "center",
                  }}
                >
                  <input type="hidden" name="nichePath" value={node.path} />
                  <input type="hidden" name="nichePriority" value={String(n?.priority ?? index + 1)} />
                  <span className="meta">{parentLabel(node.path)}</span>
                  <strong>{isChild ? `↳ ${categoryLabel(node.path)}` : categoryLabel(node.path)}</strong>
                  <input
                    name="nicheKeywords"
                    defaultValue={n?.keywords ?? categoryLabel(node.path)}
                    placeholder="e.g. smart home lock OR https://www.amazon.com/s?k=smart+home+lock"
                    style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "0.45rem 0.55rem" }}
                  />
                  <input
                    name="nicheMaxItems"
                    type="number"
                    min={1}
                    max={10}
                    defaultValue={n?.maxItems ?? 8}
                    title="Requested post count for this niche (db/niche)"
                    style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "0.45rem 0.55rem", width: 80 }}
                  />
                  <span className="meta">posts/run</span>
                  <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                    <input type="checkbox" name="nicheEnabled" value={node.path} defaultChecked={n?.isEnabled ?? true} /> Enabled
                  </label>
                </div>
              );
            })}
          </div>
        </section>

        <button className="btn" type="submit" style={{ width: "fit-content" }}>
          Save Automation Settings
        </button>
      </form>

      <form action="/admin/automation/run" method="post" style={{ marginTop: "1rem", display: "grid", gap: "0.6rem" }}>
        <p className="meta">Run now uses the full pipeline with the saved niche settings and publish mode.</p>
        <button className="btn" type="submit">
          Trigger Run Now
        </button>
      </form>

      <section className="card" style={{ marginTop: "1rem" }}>
        <h2>Recent Runs</h2>
        <div className="grid-list" style={{ marginTop: "0.8rem" }}>
          {runs.length === 0 ? (
            <p className="page-sub">No runs yet.</p>
          ) : (
            runs.map((run) => (
              <article key={run.id} className="card">
                <p>
                  {run.source} · {run.status}
                </p>
                <p className="meta">
                  requested posts: {run.itemsSeen} · pages completed: {run.itemsPosted}
                </p>
                <p className="meta">started: {new Date(run.startedAt).toLocaleString()}</p>
                {run.message ? <p className="page-sub">{run.message}</p> : null}
              </article>
            ))
          )}
        </div>
      </section>
    </main>
  );
}

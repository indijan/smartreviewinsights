import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdminSession } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ days?: string }>;
};

function dayStart(days: number) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return d;
}

export default async function AutomationInsightsPage({ searchParams }: Props) {
  if (!(await isAdminSession())) {
    redirect("/admin/login");
  }

  const { days } = await searchParams;
  const period = [7, 30, 90].includes(Number(days)) ? Number(days) : 30;
  const since = dayStart(period);

  const [logs, signals, recentRuns] = await Promise.all([
    prisma.aiGenerationLog.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 300,
    }),
    prisma.automationPatternSignal.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 400,
    }),
    prisma.automationRun.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { source: true, status: true, itemsSeen: true, itemsPosted: true, startedAt: true, message: true },
    }),
  ]);

  const total = logs.length;
  const usedAi = logs.filter((l) => l.usedAi).length;
  const fallback = logs.filter((l) => l.fallbackUsed).length;
  const qualityVals = logs.map((l) => l.qualityScore).filter((n): n is number => typeof n === "number");
  const avgQuality = qualityVals.length ? Math.round(qualityVals.reduce((a, b) => a + b, 0) / qualityVals.length) : 0;

  const byCategory = new Map<string, { total: number; aiUsed: number; avgQSum: number; avgQCount: number }>();
  for (const s of signals) {
    const key = s.categoryPath;
    const item = byCategory.get(key) ?? { total: 0, aiUsed: 0, avgQSum: 0, avgQCount: 0 };
    item.total += 1;
    if (s.aiUsed) item.aiUsed += 1;
    if (typeof s.qualityScore === "number") {
      item.avgQSum += s.qualityScore;
      item.avgQCount += 1;
    }
    byCategory.set(key, item);
  }

  const topCategories = Array.from(byCategory.entries())
    .map(([categoryPath, v]) => ({
      categoryPath,
      total: v.total,
      aiRate: v.total ? Math.round((v.aiUsed / v.total) * 100) : 0,
      avgQuality: v.avgQCount ? Math.round(v.avgQSum / v.avgQCount) : 0,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 12);

  const topProducts = signals
    .slice()
    .sort((a, b) => (b.qualityScore ?? 0) - (a.qualityScore ?? 0))
    .slice(0, 12);

  const aiRate = total ? Math.round((usedAi / total) * 100) : 0;
  const fallbackRate = total ? Math.round((fallback / total) * 100) : 0;

  return (
    <main>
      <div className="page-head">
        <h1 className="page-title">Automation Insights</h1>
        <p className="page-sub">AI usage, fallback ratio, quality score, and learned category/product patterns.</p>
      </div>

      <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
        {[7, 30, 90].map((d) => (
          <Link key={d} className="card" href={`/admin/automation/insights?days=${d}`} style={d === period ? { borderColor: "var(--accent)", fontWeight: 700 } : undefined}>
            {d} days
          </Link>
        ))}
      </div>

      <section className="grid-list" style={{ marginTop: 16 }}>
        <article className="card">
          <h2>Total AI generations</h2>
          <p style={{ fontSize: 28, fontWeight: 700, marginTop: 8 }}>{total}</p>
        </article>
        <article className="card">
          <h2>AI used ratio</h2>
          <p style={{ fontSize: 28, fontWeight: 700, marginTop: 8 }}>{aiRate}%</p>
        </article>
        <article className="card">
          <h2>Fallback ratio</h2>
          <p style={{ fontSize: 28, fontWeight: 700, marginTop: 8 }}>{fallbackRate}%</p>
        </article>
        <article className="card">
          <h2>Average quality score</h2>
          <p style={{ fontSize: 28, fontWeight: 700, marginTop: 8 }}>{avgQuality}</p>
        </article>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <h2>Top Learned Categories</h2>
        <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
          {topCategories.length === 0 ? (
            <p className="page-sub">No pattern signals yet. Run automation first.</p>
          ) : (
            topCategories.map((row) => (
              <p key={row.categoryPath}>
                <strong>{row.categoryPath}</strong> · signals={row.total} · aiRate={row.aiRate}% · avgQ={row.avgQuality}
              </p>
            ))
          )}
        </div>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <h2>Top Product Signals</h2>
        <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
          {topProducts.length === 0 ? (
            <p className="page-sub">No product signals yet.</p>
          ) : (
            topProducts.map((row) => (
              <p key={row.id}>
                <strong>{row.productName}</strong> · {row.categoryPath} · quality={row.qualityScore ?? 0} · offers={row.validOffersCount}
              </p>
            ))
          )}
        </div>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <h2>Recent Automation Runs</h2>
        <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
          {recentRuns.length === 0 ? (
            <p className="page-sub">No runs in this period.</p>
          ) : (
            recentRuns.map((run, i) => (
              <p key={`${run.startedAt.toISOString()}-${i}`}>
                {run.source} · {run.status} · requested={run.itemsSeen} · pages={run.itemsPosted} · {new Date(run.startedAt).toLocaleString()}
              </p>
            ))
          )}
        </div>
      </section>
    </main>
  );
}

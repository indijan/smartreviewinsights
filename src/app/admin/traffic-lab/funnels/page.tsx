import { redirect } from "next/navigation";
import { isAdminSession } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function TrafficLabFunnelsPage() {
  if (!(await isAdminSession())) redirect("/admin/login");
  const [funnels, niches] = await Promise.all([
    prisma.trafficFunnel.findMany({ include: { niche: true }, orderBy: [{ updatedAt: "desc" }] }),
    prisma.trafficNiche.findMany({ orderBy: [{ name: "asc" }] }),
  ]);

  return (
    <main>
      <h1 className="page-title">Traffic Lab Funnels</h1>
      <form action="/admin/traffic-lab/funnels/save" method="post" className="card" style={{ display: "grid", gap: "0.7rem", marginTop: "1rem" }}>
        <h2>Create Funnel</h2>
        <input name="name" placeholder="wake-tired-v1" />
        <input name="slug" placeholder="wake-tired-v1" />
        <select name="nicheId" defaultValue="">
          <option value="" disabled>Select niche</option>
          {niches.map((niche) => <option key={niche.id} value={niche.id}>{niche.name}</option>)}
        </select>
        <div className="pager-row">
          <input name="entryPageId" placeholder="entry page id" />
          <input name="quizPageId" placeholder="quiz page id" />
          <input name="status" placeholder="draft" />
        </div>
        <input name="deepPageIds" placeholder='["pageA","pageB"]' />
        <input name="comparisonPageIds" placeholder='["cmpA","cmpB"]' />
        <div className="pager-row">
          <input name="targetCpc" placeholder="0.35" />
          <input name="targetRpm" placeholder="18" />
          <input name="targetEpv" placeholder="0.22" />
        </div>
        <button className="btn" type="submit">Save Funnel</button>
      </form>

      <section className="card" style={{ marginTop: "1rem" }}>
        <h2>Existing Funnels</h2>
        <div style={{ marginTop: "0.8rem", display: "grid", gap: "0.5rem" }}>
          {funnels.map((funnel) => (
            <p key={funnel.id}>{funnel.name} · {funnel.slug} · {funnel.niche?.name ?? "No niche"} · {funnel.status}</p>
          ))}
        </div>
      </section>
    </main>
  );
}

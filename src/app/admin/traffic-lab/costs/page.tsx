import { redirect } from "next/navigation";
import { isAdminSession } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function TrafficLabCostsPage() {
  if (!(await isAdminSession())) redirect("/admin/login");
  const [rows, niches] = await Promise.all([
    prisma.trafficCampaignCost.findMany({ include: { niche: true }, orderBy: [{ date: "desc" }], take: 100 }),
    prisma.trafficNiche.findMany({ orderBy: [{ name: "asc" }] }),
  ]);
  return (
    <main>
      <h1 className="page-title">Traffic Lab Traffic Costs</h1>
      <form action="/admin/traffic-lab/costs/save" method="post" className="card" style={{ display: "grid", gap: "0.7rem", marginTop: "1rem" }}>
        <h2>Import Cost Row</h2>
        <select name="nicheId" defaultValue="">
          <option value="">No niche</option>
          {niches.map((niche) => <option key={niche.id} value={niche.id}>{niche.name}</option>)}
        </select>
        <div className="pager-row">
          <input name="date" type="date" />
          <input name="source" placeholder="Meta" />
          <input name="campaignName" placeholder="campaign name" />
          <input name="utmCampaign" placeholder="utm_campaign" />
        </div>
        <div className="pager-row">
          <input name="spend" placeholder="100.00" />
          <input name="clicks" placeholder="250" />
          <input name="cpc" placeholder="0.40" />
        </div>
        <textarea name="notes" rows={3} placeholder="Notes" />
        <button className="btn" type="submit">Save Cost</button>
      </form>
      <section className="card" style={{ marginTop: "1rem" }}>
        <h2>Recent Costs</h2>
        <div style={{ marginTop: "0.8rem", display: "grid", gap: "0.5rem" }}>
          {rows.map((row) => (
            <p key={row.id}>{new Date(row.date).toLocaleDateString()} · {row.source} · {row.campaignName} · ${row.spend.toString()}</p>
          ))}
        </div>
      </section>
    </main>
  );
}

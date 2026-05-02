import { redirect } from "next/navigation";
import { isAdminSession } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function TrafficLabRevenuePage() {
  if (!(await isAdminSession())) redirect("/admin/login");
  const [rows, niches] = await Promise.all([
    prisma.trafficRevenueImport.findMany({ include: { niche: true }, orderBy: [{ date: "desc" }], take: 100 }),
    prisma.trafficNiche.findMany({ orderBy: [{ name: "asc" }] }),
  ]);
  return (
    <main>
      <h1 className="page-title">Traffic Lab Revenue</h1>
      <form action="/admin/traffic-lab/revenue/save" method="post" className="card" style={{ display: "grid", gap: "0.7rem", marginTop: "1rem" }}>
        <h2>Import Revenue Row</h2>
        <select name="nicheId" defaultValue="">
          <option value="">No niche</option>
          {niches.map((niche) => <option key={niche.id} value={niche.id}>{niche.name}</option>)}
        </select>
        <div className="pager-row">
          <input name="date" type="date" />
          <input name="source" placeholder="Amazon" />
          <input name="pagePath" placeholder="/sleep-energy/best-sleep-trackers/" />
        </div>
        <div className="pager-row">
          <input name="revenue" placeholder="42.50" />
          <input name="clicks" placeholder="12" />
          <input name="impressions" placeholder="1200" />
          <input name="rpm" placeholder="18.50" />
          <input name="epc" placeholder="0.62" />
        </div>
        <textarea name="notes" rows={3} placeholder="Notes" />
        <button className="btn" type="submit">Save Revenue</button>
      </form>
      <section className="card" style={{ marginTop: "1rem" }}>
        <h2>Recent Revenue Rows</h2>
        <div style={{ marginTop: "0.8rem", display: "grid", gap: "0.5rem" }}>
          {rows.map((row) => (
            <p key={row.id}>{new Date(row.date).toLocaleDateString()} · {row.source} · ${row.revenue.toString()} · {row.pagePath ?? "-"}</p>
          ))}
        </div>
      </section>
    </main>
  );
}

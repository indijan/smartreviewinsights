import { redirect } from "next/navigation";
import { isAdminSession } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function TrafficLabNichesPage() {
  if (!(await isAdminSession())) redirect("/admin/login");
  const niches = await prisma.trafficNiche.findMany({ orderBy: [{ updatedAt: "desc" }] });

  return (
    <main>
      <h1 className="page-title">Traffic Lab Niches</h1>
      <form action="/admin/traffic-lab/niches/save" method="post" className="card" style={{ display: "grid", gap: "0.7rem", marginTop: "1rem" }}>
        <h2>Create Niche</h2>
        <input name="name" placeholder="Pets / Dog Problems" />
        <input name="slug" placeholder="pets-dog-problems" />
        <textarea name="description" placeholder="Short niche description" rows={3} />
        <div className="pager-row">
          <input name="status" placeholder="active" />
          <input name="primaryMonetization" placeholder="affiliate" />
          <input name="riskLevel" placeholder="low" />
          <input name="targetGeography" placeholder="NZ / US / Global" />
        </div>
        <textarea name="notes" placeholder="Notes" rows={3} />
        <button className="btn" type="submit">Save Niche</button>
      </form>

      <section className="card" style={{ marginTop: "1rem" }}>
        <h2>Existing Niches</h2>
        <div style={{ marginTop: "0.8rem", display: "grid", gap: "0.5rem" }}>
          {niches.map((niche) => (
            <p key={niche.id}>{niche.name} · {niche.slug} · {niche.status} · {niche.primaryMonetization}</p>
          ))}
        </div>
      </section>
    </main>
  );
}

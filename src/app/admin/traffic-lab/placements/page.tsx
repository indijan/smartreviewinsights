import { redirect } from "next/navigation";
import { isAdminSession } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function TrafficLabPlacementsPage() {
  if (!(await isAdminSession())) redirect("/admin/login");
  const [placements, pages, trafficOffers] = await Promise.all([
    prisma.trafficPlacement.findMany({ include: { page: true, offers: { include: { offer: true } } }, orderBy: [{ updatedAt: "desc" }] }),
    prisma.page.findMany({ where: { status: "PUBLISHED" }, orderBy: [{ updatedAt: "desc" }], take: 100, select: { id: true, title: true, slug: true } }),
    prisma.trafficOffer.findMany({ where: { status: "active" }, orderBy: [{ updatedAt: "desc" }], take: 100 }),
  ]);

  return (
    <main>
      <h1 className="page-title">Traffic Lab Placements</h1>
      <form action="/admin/traffic-lab/placements/save" method="post" className="card" style={{ display: "grid", gap: "0.7rem", marginTop: "1rem" }}>
        <h2>Create Placement</h2>
        <input name="name" placeholder="mid-article-card" />
        <input name="slug" placeholder="mid-article-card" />
        <div className="pager-row">
          <input name="placementType" placeholder="inline_card" />
          <input name="weight" placeholder="100" />
          <input name="maxImpressionsPerSession" placeholder="3" />
          <input name="status" placeholder="active" />
        </div>
        <select name="pageId" defaultValue="">
          <option value="">No fixed page</option>
          {pages.map((page) => <option key={page.id} value={page.id}>{page.title}</option>)}
        </select>
        <select name="offerIds" multiple size={8}>
          {trafficOffers.map((offer) => <option key={offer.id} value={offer.id}>{offer.name}</option>)}
        </select>
        <button className="btn" type="submit">Save Placement</button>
      </form>

      <section className="card" style={{ marginTop: "1rem" }}>
        <h2>Existing Placements</h2>
        <div style={{ marginTop: "0.8rem", display: "grid", gap: "0.5rem" }}>
          {placements.map((placement) => (
            <p key={placement.id}>{placement.name} · {placement.placementType} · offers={placement.offers.length}</p>
          ))}
        </div>
      </section>
    </main>
  );
}

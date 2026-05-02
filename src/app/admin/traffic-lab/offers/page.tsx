import { redirect } from "next/navigation";
import { isAdminSession } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function TrafficLabOffersPage() {
  if (!(await isAdminSession())) redirect("/admin/login");
  const [offers, niches] = await Promise.all([
    prisma.trafficOffer.findMany({ include: { niche: true }, orderBy: [{ updatedAt: "desc" }] }),
    prisma.trafficNiche.findMany({ orderBy: [{ name: "asc" }] }),
  ]);

  return (
    <main>
      <h1 className="page-title">Traffic Lab Offers</h1>
      <form action="/admin/traffic-lab/offers/save" method="post" className="card" style={{ display: "grid", gap: "0.7rem", marginTop: "1rem" }}>
        <h2>Create Offer</h2>
        <input name="name" placeholder="Sleep Tracker Best Overall" />
        <input name="slug" placeholder="sleep-tracker-best-overall" />
        <select name="nicheId" defaultValue="">
          <option value="">No niche</option>
          {niches.map((niche) => <option key={niche.id} value={niche.id}>{niche.name}</option>)}
        </select>
        <div className="pager-row">
          <input name="offerType" placeholder="affiliate" />
          <input name="network" placeholder="Amazon" />
          <input name="commissionType" placeholder="cpa" />
        </div>
        <input name="destinationUrl" placeholder="https://partner.com/product" />
        <input name="trackingUrl" placeholder="optional tracking URL" />
        <div className="pager-row">
          <input name="estimatedEpc" placeholder="0.42" />
          <input name="geo" placeholder="US" />
          <input name="device" placeholder="all" />
          <input name="status" placeholder="active" />
        </div>
        <label><input type="checkbox" name="disclosureRequired" defaultChecked /> Disclosure required</label>
        <textarea name="notes" rows={3} placeholder="Notes" />
        <button className="btn" type="submit">Save Offer</button>
      </form>

      <section className="card" style={{ marginTop: "1rem" }}>
        <h2>Existing Offers</h2>
        <div style={{ marginTop: "0.8rem", display: "grid", gap: "0.5rem" }}>
          {offers.map((offer) => (
            <p key={offer.id}>{offer.name} · {offer.slug} · {offer.niche?.name ?? "No niche"} · {offer.offerType}</p>
          ))}
        </div>
      </section>
    </main>
  );
}

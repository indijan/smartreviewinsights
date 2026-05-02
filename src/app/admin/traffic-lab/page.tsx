import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdminSession } from "@/lib/admin";
import { getTrafficLabDashboard } from "@/lib/traffic-lab";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ days?: string }>;
};

export default async function TrafficLabPage({ searchParams }: Props) {
  if (!(await isAdminSession())) {
    redirect("/admin/login");
  }

  const { days } = await searchParams;
  const period = [7, 30, 90].includes(Number(days)) ? Number(days) : 30;
  const data = await getTrafficLabDashboard(period);

  return (
    <main>
      <div className="page-head">
        <h1 className="page-title">Traffic Lab</h1>
        <p className="page-sub">Traffic Lab → Niche Validation Engine → Content Funnel Engine → Outbound Recommendation Layer.</p>
        <div className="pager-row" style={{ marginTop: "0.8rem" }}>
          <Link className="chip" href="/admin/traffic-lab/niches">Niches</Link>
          <Link className="chip" href="/admin/traffic-lab/funnels">Funnels</Link>
          <Link className="chip" href="/admin/traffic-lab/offers">Offers</Link>
          <Link className="chip" href="/admin/traffic-lab/placements">Placements</Link>
          <Link className="chip" href="/admin/traffic-lab/ctas">CTA Variants</Link>
          <Link className="chip" href="/admin/traffic-lab/costs">Traffic Costs</Link>
          <Link className="chip" href="/admin/traffic-lab/revenue">Revenue</Link>
          <Link className="chip" href="/admin/traffic-lab/content-builder">Content Builder</Link>
        </div>
      </div>

      <div className="grid-list">
        <section className="card">
          <h2>Impressions ({period}d)</h2>
          <p style={{ fontSize: 28, fontWeight: 700 }}>{data.totalImpressions}</p>
        </section>
        <section className="card">
          <h2>Outbound Clicks ({period}d)</h2>
          <p style={{ fontSize: 28, fontWeight: 700 }}>{data.totalClicks}</p>
        </section>
        <section className="card">
          <h2>Outbound CTR ({period}d)</h2>
          <p style={{ fontSize: 28, fontWeight: 700 }}>{data.outboundCtr.toFixed(2)}%</p>
        </section>
        <section className="card">
          <h2>Revenue ({period}d)</h2>
          <p style={{ fontSize: 28, fontWeight: 700 }}>${data.totalRevenue.toFixed(2)}</p>
        </section>
        <section className="card">
          <h2>Traffic Cost ({period}d)</h2>
          <p style={{ fontSize: 28, fontWeight: 700 }}>${data.totalCost.toFixed(2)}</p>
        </section>
        <section className="card">
          <h2>Estimated Profit ({period}d)</h2>
          <p style={{ fontSize: 28, fontWeight: 700, color: data.profit >= 0 ? "var(--accent)" : "#b42318" }}>
            ${data.profit.toFixed(2)}
          </p>
        </section>
      </div>

      <section className="card" style={{ marginTop: "1rem" }}>
        <h2>Top Traffic Offers</h2>
        <div style={{ marginTop: "0.8rem", display: "grid", gap: "0.5rem" }}>
          {data.topTrafficOffers.length === 0 ? <p className="meta">No tracked offer clicks yet.</p> : data.topTrafficOffers.map((item) => (
            <p key={item.slug}>{item.name} ({item.slug}) · {item.clicks}</p>
          ))}
        </div>
      </section>

      <section className="card" style={{ marginTop: "1rem" }}>
        <h2>Top Pages By Outbound Clicks</h2>
        <div style={{ marginTop: "0.8rem", display: "grid", gap: "0.5rem" }}>
          {data.topTrafficPages.length === 0 ? <p className="meta">No tracked page clicks yet.</p> : data.topTrafficPages.map((item) => (
            <p key={item.slug}><Link href={`/${item.slug}`}>{item.title}</Link> · {item.clicks}</p>
          ))}
        </div>
      </section>

      <section className="card" style={{ marginTop: "1rem" }}>
        <h2>Placement CTR</h2>
        <div style={{ marginTop: "0.8rem", display: "grid", gap: "0.5rem" }}>
          {data.placementCtrRows.length === 0 ? <p className="meta">No impression rows yet.</p> : data.placementCtrRows.map((item) => (
            <p key={item.placement_slug}>{item.placement_name} ({item.placement_slug}) · {item.clicks}/{item.impressions} · {item.ctr.toFixed(2)}%</p>
          ))}
        </div>
      </section>

      <section className="card" style={{ marginTop: "1rem" }}>
        <h2>UTM Campaign Breakdown</h2>
        <div style={{ marginTop: "0.8rem", display: "grid", gap: "0.5rem" }}>
          {data.campaignRows.length === 0 ? <p className="meta">No campaign cost or revenue rows yet.</p> : data.campaignRows.map((item) => (
            <p key={item.utm_campaign}>{item.utm_campaign} · spend ${item.spend.toFixed(2)} · revenue ${item.revenue.toFixed(2)} · profit ${item.profit.toFixed(2)}</p>
          ))}
        </div>
      </section>

      <section className="card" style={{ marginTop: "1rem" }}>
        <h2>Recent Niches</h2>
        <div style={{ marginTop: "0.8rem", display: "grid", gap: "0.5rem" }}>
          {data.niches.length === 0 ? <p className="meta">No traffic niches yet.</p> : data.niches.map((niche) => (
            <p key={niche.id}>{niche.name} · {niche.slug} · {niche.status}</p>
          ))}
        </div>
      </section>

      <section className="card" style={{ marginTop: "1rem" }}>
        <h2>Recent Funnels</h2>
        <div style={{ marginTop: "0.8rem", display: "grid", gap: "0.5rem" }}>
          {data.funnels.length === 0 ? <p className="meta">No traffic funnels yet.</p> : data.funnels.map((funnel) => (
            <p key={funnel.id}>{funnel.name} · {funnel.niche?.name ?? "No niche"} · {funnel.status}</p>
          ))}
        </div>
      </section>
    </main>
  );
}

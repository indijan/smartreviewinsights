import Link from "next/link";
import { redirect } from "next/navigation";
import { getClickAnalytics } from "@/lib/analytics";
import { isAdminSession } from "@/lib/admin";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ days?: string }>;
};

export default async function AdminAnalyticsPage({ searchParams }: Props) {
  const { days } = await searchParams;
  const parsedDays = Number(days ?? "30");
  const period = [7, 30, 90].includes(parsedDays) ? parsedDays : 30;

  if (!(await isAdminSession())) {
    redirect("/admin/login");
  }

  const data = await getClickAnalytics(period);

  return (
    <main>
      <h1>Admin Analytics</h1>
      <p style={{ marginTop: 8, color: "var(--muted)" }}>
        Click tracking overview for the selected period.
      </p>
      <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
        {[7, 30, 90].map((d) => (
          <Link
            key={d}
            className="card"
            href={`/admin/analytics?days=${d}`}
            style={d === period ? { borderColor: "var(--accent)", fontWeight: 700 } : undefined}
          >
            {d} days
          </Link>
        ))}
      </div>

      <section style={{ marginTop: 16 }} className="card">
        <h2>Total Clicks ({period}d)</h2>
        <p style={{ marginTop: 8, fontSize: 28, fontWeight: 700 }}>{data.totalClicks}</p>
      </section>

      <section style={{ marginTop: 16 }} className="card">
        <h2>Daily Clicks</h2>
        <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
          {data.daily.length === 0 ? (
            <p style={{ color: "var(--muted)" }}>No click events yet.</p>
          ) : (
            data.daily.map((row) => (
              <p key={row.day}>
                {row.day}: {row.clicks}
              </p>
            ))
          )}
        </div>
      </section>

      <section style={{ marginTop: 16 }} className="card">
        <h2>Top Pages</h2>
        <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
          {data.topPages.length === 0 ? (
            <p style={{ color: "var(--muted)" }}>No page-level clicks yet.</p>
          ) : (
            data.topPages.map((page) => (
              <p key={page.slug}>
                <Link href={`/${page.slug}`}>{page.title}</Link> ({page.clicks})
              </p>
            ))
          )}
        </div>
      </section>

      <section style={{ marginTop: 16 }} className="card">
        <h2>Top Offers</h2>
        <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
          {data.topOffers.length === 0 ? (
            <p style={{ color: "var(--muted)" }}>No offer clicks yet.</p>
          ) : (
            data.topOffers.map((offer) => (
              <p key={offer.id}>
                {offer.title ?? offer.canonicalName} [{offer.source}] ({offer.clicks})
              </p>
            ))
          )}
        </div>
      </section>
    </main>
  );
}

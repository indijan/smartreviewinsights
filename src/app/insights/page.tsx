import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getLatestTrafficTestPages } from "@/lib/pages";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Attention Tests",
  description: "Live SmartReviewInsights attention tests built for cheap-click capture, bridge retention, and exit clicks.",
  alternates: { canonical: "/insights" },
  robots: { index: true, follow: true },
};

export default async function InsightsHubPage() {
  const items = await getLatestTrafficTestPages(30);

  return (
    <main>
      <div className="page-head">
        <h1 className="page-title">Attention Tests</h1>
        <p className="page-sub">
          Live entry, bridge, and exit pages generated for traffic-arbitrage style experiments on SmartReviewInsights.
        </p>
      </div>

      <section className="grid-list">
        {items.length === 0 ? (
          <div className="card">No live attention tests yet.</div>
        ) : items.map((entry) => (
          <article key={entry.id} className="card article-link-card">
            <div className={`article-card-row${entry.heroImageUrl ? "" : " no-thumb"}`}>
              {entry.heroImageUrl ? (
                <Link href={`/${entry.slug}`} className="article-card-thumb-link" aria-label={entry.title}>
                  <Image src={entry.heroImageUrl} alt={entry.title} className="article-card-thumb" width={320} height={320} loading="lazy" />
                </Link>
              ) : null}
              <div className="article-card-content">
                <Link href={`/${entry.slug}`}>
                  <h2>{entry.title}</h2>
                </Link>
                {entry.excerpt ? <p className="page-sub">{entry.excerpt}</p> : null}
                <p className="meta">
                  {entry.slug.startsWith("insights/") ? "Entry test" : entry.slug.startsWith("guides/") ? "Bridge test" : "Exit test"}
                  {entry.publishedAt ? ` · ${new Date(entry.publishedAt).toLocaleDateString()}` : ""}
                </p>
              </div>
            </div>
          </article>
        ))}
      </section>

      <p style={{ marginTop: "1rem" }}>
        <Link className="btn" href="/">
          Back To Home
        </Link>
      </p>
    </main>
  );
}

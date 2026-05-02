type Row = {
  product: string;
  bestFor: string;
  benefit: string;
  priceRange?: string | null;
  ctaHref: string;
  ctaLabel?: string;
};

type Props = {
  title?: string;
  rows: Row[];
};

export default function TrafficComparisonTable({ title = "Comparison", rows }: Props) {
  if (rows.length === 0) return null;

  return (
    <section className="card">
      <h3>{title}</h3>
      <div style={{ overflowX: "auto", marginTop: "0.8rem" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th align="left">Product</th>
              <th align="left">Best for</th>
              <th align="left">Key benefit</th>
              <th align="left">Price</th>
              <th align="left">CTA</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.product}-${row.ctaHref}`} style={{ borderTop: "1px solid var(--border)" }}>
                <td style={{ padding: "0.6rem 0.3rem" }}>{row.product}</td>
                <td style={{ padding: "0.6rem 0.3rem" }}>{row.bestFor}</td>
                <td style={{ padding: "0.6rem 0.3rem" }}>{row.benefit}</td>
                <td style={{ padding: "0.6rem 0.3rem" }}>{row.priceRange ?? "-"}</td>
                <td style={{ padding: "0.6rem 0.3rem" }}>
                  <a className="chip" href={row.ctaHref} rel="nofollow sponsored noopener noreferrer" target="_blank">
                    {row.ctaLabel ?? "Compare"}
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

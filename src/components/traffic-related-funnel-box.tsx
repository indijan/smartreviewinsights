import Link from "next/link";

type Item = {
  href: string;
  label: string;
};

type Props = {
  title?: string;
  items: Item[];
};

export default function TrafficRelatedFunnelBox({ title = "Still not sure?", items }: Props) {
  if (items.length === 0) return null;

  return (
    <section className="card">
      <h3>{title}</h3>
      <div className="pager-row" style={{ marginTop: "0.8rem" }}>
        {items.map((item) => (
          <Link key={item.href} className="chip" href={item.href}>
            {item.label}
          </Link>
        ))}
      </div>
    </section>
  );
}

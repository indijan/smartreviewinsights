import Link from "next/link";
import TrafficImpressionBeacon from "@/components/traffic-impression-beacon";

type Props = {
  offerSlug: string;
  title: string;
  description?: string | null;
  buttonText?: string;
  placementSlug?: string;
  ctaSlug?: string;
  funnelSlug?: string;
  pageSlug?: string;
  disclosureRequired?: boolean;
};

export default function TrafficOfferCard({
  offerSlug,
  title,
  description,
  buttonText = "Compare Now",
  placementSlug,
  ctaSlug,
  funnelSlug,
  pageSlug,
  disclosureRequired = true,
}: Props) {
  const params = new URLSearchParams();
  if (placementSlug) params.set("p", placementSlug);
  if (ctaSlug) params.set("v", ctaSlug);
  if (funnelSlug) params.set("f", funnelSlug);
  if (pageSlug) params.set("page", pageSlug);

  return (
    <section className="card" style={{ position: "relative" }}>
      <TrafficImpressionBeacon
        offerSlug={offerSlug}
        placementSlug={placementSlug}
        ctaSlug={ctaSlug}
        pageSlug={pageSlug}
      />
      <p className="meta">Recommended pick</p>
      <h3 style={{ marginTop: "0.35rem" }}>{title}</h3>
      {description ? <p className="page-sub">{description}</p> : null}
      <p style={{ marginTop: "0.8rem" }}>
        <Link className="btn" href={`/go/${offerSlug}?${params.toString()}`}>
          {buttonText}
        </Link>
      </p>
      {disclosureRequired ? (
        <p className="meta" style={{ marginTop: "0.7rem" }}>
          Smart Review Insights may earn a commission when you click partner links.
        </p>
      ) : null}
    </section>
  );
}

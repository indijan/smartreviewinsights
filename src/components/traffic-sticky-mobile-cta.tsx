"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type Props = {
  offerSlug: string;
  label?: string;
  placementSlug?: string;
  ctaSlug?: string;
  pageSlug?: string;
};

export default function TrafficStickyMobileCta({
  offerSlug,
  label = "Compare top picks",
  placementSlug,
  ctaSlug,
  pageSlug,
}: Props) {
  const [dismissed, setDismissed] = useState(false);
  const href = useMemo(() => {
    const params = new URLSearchParams();
    if (placementSlug) params.set("p", placementSlug);
    if (ctaSlug) params.set("v", ctaSlug);
    if (pageSlug) params.set("page", pageSlug);
    return `/go/${offerSlug}?${params.toString()}`;
  }, [ctaSlug, offerSlug, pageSlug, placementSlug]);

  if (dismissed) return null;

  return (
    <div
      style={{
        position: "fixed",
        left: "0.75rem",
        right: "0.75rem",
        bottom: "0.75rem",
        zIndex: 30,
        display: "flex",
        gap: "0.6rem",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0.8rem 0.9rem",
        borderRadius: "14px",
        background: "rgba(17, 24, 39, 0.96)",
        color: "#fff",
        boxShadow: "0 12px 28px rgba(0, 0, 0, 0.24)",
      }}
    >
      <span style={{ fontWeight: 600 }}>{label}</span>
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <Link href={href} className="chip" style={{ background: "#fff", color: "#111827" }}>
          Compare
        </Link>
        <button type="button" className="chip" onClick={() => setDismissed(true)}>
          Close
        </button>
      </div>
    </div>
  );
}

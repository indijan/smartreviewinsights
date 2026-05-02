"use client";

import { useEffect, useRef } from "react";

type Props = {
  offerSlug?: string;
  placementSlug?: string;
  ctaSlug?: string;
  pageSlug?: string;
  nicheSlug?: string;
};

export default function TrafficImpressionBeacon(props: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const firedRef = useRef(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || firedRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting || firedRef.current) return;
        firedRef.current = true;

        fetch("/api/traffic-lab/impression", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(props),
          keepalive: true,
        }).catch(() => undefined);

        observer.disconnect();
      },
      { threshold: 0.35 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [props]);

  return <div ref={ref} aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none" }} />;
}

"use client";

import { useMemo, useState } from "react";

type Props = {
  images: string[];
  altBase: string;
};

export default function ImageGallery({ images, altBase }: Props) {
  const uniqueImages = useMemo(() => {
    const score = (url: string) => {
      let total = 0;
      const nums = Array.from(url.matchAll(/([0-9]{3,4})/g)).map((m) => Number(m[1]));
      if (nums.length > 0) total += Math.max(...nums);
      if (/sl1500|sl2000|ul1500|ux1500|ac_sl1500|ac_ul1500/i.test(url)) total += 2000;
      if (/sprite|icon|thumb|thumbnail|play|logo/i.test(url)) total -= 3000;
      return total;
    };

    return [...new Set(images.filter(Boolean))].sort((a, b) => score(b) - score(a));
  }, [images]);
  const [active, setActive] = useState(0);
  const [failedLarge, setFailedLarge] = useState<Record<number, boolean>>({});

  if (uniqueImages.length === 0) return null;
  const thumbImages = uniqueImages.slice(0, 5);

  const activeIndex = Math.min(active, uniqueImages.length - 1);
  const activeSrc = uniqueImages[activeIndex] ?? uniqueImages[0];
  const largeAmazonSrc = activeSrc.includes("m.media-amazon.com/images/")
    ? activeSrc.replace(/(\.jpg|\.jpeg|\.png|\.webp)$/i, "._SL1500_$1")
    : activeSrc;
  const finalActiveSrc = failedLarge[activeIndex] ? activeSrc : largeAmazonSrc;

  return (
    <section className="product-gallery card" aria-label="Product image gallery">
      {uniqueImages.length > 1 ? (
        <div className="product-gallery-thumbs" role="list">
          {thumbImages.map((src, idx) => (
            <button
              key={`${src}-${idx}`}
              type="button"
              className={`thumb-btn${idx === active ? " active" : ""}`}
              onClick={() => setActive(idx)}
              aria-label={`Show image ${idx + 1}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={`${altBase} thumbnail ${idx + 1}`} loading="lazy" />
            </button>
          ))}
        </div>
      ) : null}
      <div className="product-gallery-main">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={finalActiveSrc}
          alt={`${altBase} image ${active + 1}`}
          loading="eager"
          onError={() => {
            if (finalActiveSrc !== activeSrc) {
              setFailedLarge((prev) => ({ ...prev, [activeIndex]: true }));
            }
          }}
        />
      </div>
    </section>
  );
}

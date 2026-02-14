"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
  topOffset?: number;
};

export default function StickySidebar({ children, className, topOffset = 88 }: Props) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const shell = shellRef.current;
    const inner = innerRef.current;
    if (!shell || !inner) return;

    const apply = () => {
      const mobile = window.innerWidth <= 780;
      if (mobile) {
        inner.style.position = "static";
        inner.style.top = "auto";
        inner.style.bottom = "auto";
        inner.style.width = "auto";
        return;
      }

      const shellRect = shell.getBoundingClientRect();
      const shellTopAbs = window.scrollY + shellRect.top;
      const scrollTop = window.scrollY;
      const fixedTop = topOffset;

      if (scrollTop + fixedTop <= shellTopAbs) {
        inner.style.position = "static";
        inner.style.top = "auto";
        inner.style.bottom = "auto";
        inner.style.width = "auto";
        return;
      }

      inner.style.position = "fixed";
      inner.style.top = `${fixedTop}px`;
      inner.style.bottom = "auto";
      inner.style.width = `${shell.clientWidth}px`;
    };

    apply();
    window.addEventListener("scroll", apply, { passive: true });
    window.addEventListener("resize", apply);
    return () => {
      window.removeEventListener("scroll", apply);
      window.removeEventListener("resize", apply);
    };
  }, [topOffset]);

  return (
    <div ref={shellRef} className={className} style={{ position: "relative" }}>
      <div ref={innerRef}>{children}</div>
    </div>
  );
}

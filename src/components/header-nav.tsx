"use client";

import { useState } from "react";
import Link from "next/link";
import type { CategoryNode } from "@/lib/category-taxonomy";

type Props = {
  items: CategoryNode[];
};

export default function HeaderNav({ items }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="mobile-nav-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="site-nav"
      >
        {open ? "Close" : "Menu"}
      </button>

      <nav id="site-nav" className={`top-nav${open ? " open" : ""}`}>
        <Link className="top-link" href="/" onClick={() => setOpen(false)}>
          Latest
        </Link>
        {items.map((node) => (
          <div key={node.path} className="nav-item">
            <Link className="top-link" href={`/category/${node.path}`} onClick={() => setOpen(false)}>
              {node.label}
            </Link>
            {node.children?.length ? (
              <div className="nav-menu">
                {node.children.map((child) => (
                  <Link key={child.path} className="nav-menu-link" href={`/category/${child.path}`} onClick={() => setOpen(false)}>
                    {child.label}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </nav>
    </>
  );
}

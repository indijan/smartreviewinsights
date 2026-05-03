"use client";

import { useState } from "react";

export default function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div style={{ display: "grid", gap: "0.4rem" }}>
      <strong>{label}</strong>
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <input
          readOnly
          value={value}
          style={{ flex: 1, border: "1px solid var(--border)", borderRadius: 10, padding: "0.65rem 0.75rem" }}
        />
        <button
          type="button"
          className="chip"
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

function normalizeTextForCompare(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}& ]/gu, "")
    .trim()
    .toLowerCase();
}

function stripLegacySchemaDump(content: string): string {
  const markers = ['{"@context"', "{'@context'", '"@type":"Product"', '"@type":"AggregateOffer"'];
  const idx = markers
    .map((m) => content.indexOf(m))
    .filter((i) => i >= 0)
    .sort((a, b) => a - b)[0];
  if (typeof idx === "number" && idx >= 0) {
    return content.slice(0, idx).trim();
  }
  return content;
}

function stripLegacyNoise(content: string): string {
  return content
    .replace(/^Buy On Amazon\s*$/gim, "")
    .replace(/^Questions?\s*&\s*Answers?:\s*$/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripTopTldrSection(content: string, excerpt?: string | null): string {
  const md = content.trim();
  const match = md.match(/^##\s*TL;DR\s*\n+([\s\S]*?)(?=\n##\s|\n*$)/i);
  if (!match) {
    return md;
  }

  const sectionBody = (match[1] ?? "").trim();
  const rest = md.slice(match[0].length).trim();

  if (!excerpt) {
    return rest || md;
  }

  const sameAsExcerpt =
    normalizeTextForCompare(sectionBody) === normalizeTextForCompare(excerpt);
  return sameAsExcerpt ? rest || md : md;
}

export function normalizeContentForRender(contentMd: string, _title: string, excerpt?: string | null): string {
  const stripped = stripTopTldrSection(contentMd || "", excerpt);
  const withoutSchema = stripLegacySchemaDump(stripped);
  const cleaned = stripLegacyNoise(withoutSchema);
  const clean = cleaned.trim();
  const hasSectionHeadings = /^##\s+/m.test(clean);

  if (hasSectionHeadings) {
    return clean;
  }

  return [
    "## Overview",
    clean || "Content is being updated.",
  ].join("\n");
}

import { normalizeSlugValue } from "@/lib/traffic-lab";

type BuildDraftArgs = {
  nicheName: string;
  nicheSlug: string;
  angle: string;
  contentType: string;
  titleSeed: string;
  internalLinks: Array<{ title: string; slug: string }>;
  offerSnippets: string[];
};

function getClusterPrefix(nicheSlug: string) {
  const normalized = normalizeSlugValue(nicheSlug);
  return normalized || "guides";
}

export function buildTrafficDraft({
  nicheName,
  nicheSlug,
  angle,
  contentType,
  titleSeed,
  internalLinks,
  offerSnippets,
}: BuildDraftArgs) {
  const cleanedTitle = titleSeed.trim();
  const slugBase = normalizeSlugValue(cleanedTitle);
  const prefix = getClusterPrefix(nicheSlug);
  const pageType = contentType === "comparison" ? "REVIEW" : contentType === "checklist" || contentType === "quiz" ? "LANDING" : "ARTICLE";
  const finalTitle =
    contentType === "comparison"
      ? `${cleanedTitle}: Best Options Compared`
      : contentType === "quiz"
        ? `${cleanedTitle} Quiz`
        : contentType === "checklist"
          ? `${cleanedTitle} Checklist`
          : cleanedTitle;

  const intro = `${finalTitle} targets the ${nicheName} cluster with a ${angle.replace(/_/g, " ")} angle. Keep the opening concrete, problem-led, and useful before any recommendation appears.`;
  const linksBlock = internalLinks.length
    ? internalLinks.map((item) => `- [${item.title}](/${item.slug})`).join("\n")
    : "- Add 2-3 relevant internal links before publish.";
  const offerBlock = offerSnippets.length
    ? offerSnippets.map((item) => `- ${item}`).join("\n")
    : "- No offer selected yet. Add at least one relevant outbound recommendation before publish.";

  const contentMd = [
    `# ${finalTitle}`,
    "",
    intro,
    "",
    "## Quick answer",
    "",
    "Write a direct answer in 2-3 sentences. State what the reader should understand before they scroll further.",
    "",
    "## Why this matters",
    "",
    "Explain the main pain point, the practical consequence, and the most common mistake readers make.",
    "",
    contentType === "comparison" ? "## Comparison table" : "## What to check first",
    "",
    contentType === "comparison"
      ? "Add a concise comparison with best overall, best budget, and best fit by use case."
      : "Add 3-5 concrete checks or reasons with short explanations.",
    "",
    "## Related internal paths",
    "",
    linksBlock,
    "",
    "## Recommended offer hooks",
    "",
    offerBlock,
    "",
    "## FAQ",
    "",
    "- Question 1\n- Question 2\n- Question 3",
    "",
    "## Disclosure",
    "",
    "Smart Review Insights may earn a commission when you click links or make purchases through partner links. This does not affect editorial recommendations.",
  ].join("\n");

  return {
    slug: `${prefix}/${slugBase}`.replace(/^\/+/, ""),
    title: finalTitle,
    excerpt: `${finalTitle} for readers in the ${nicheName} niche, with a ${angle.replace(/_/g, " ")} angle and clear next-step guidance.`,
    contentMd,
    pageType,
  };
}

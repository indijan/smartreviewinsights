import { categoryLabel } from "@/lib/category-taxonomy";

function cleanText(input: string | null | undefined) {
  return String(input || "").replace(/\s+/g, " ").trim();
}

function cleanProductName(input: string | null | undefined) {
  const text = cleanText(input)
    .replace(/^Amazon\.com\s*:?\s*/i, "")
    .replace(/\s*-\s*Amazon\.com\s*$/i, "")
    .replace(/\s*:\s*Amazon\.com\s*$/i, "")
    .trim();
  return text.length > 90 ? `${text.slice(0, 87).trimEnd()}...` : text;
}

export function buildReviewTitle(productName: string, categoryPath: string) {
  const product = cleanProductName(productName);
  const category = categoryLabel(categoryPath);
  return `${product} Review: Is It Worth It for ${category}?`;
}

export function buildReviewExcerpt(args: {
  productName: string;
  categoryPath: string;
  sourceText?: string | null;
}) {
  const product = cleanProductName(args.productName);
  const category = categoryLabel(args.categoryPath).toLowerCase();
  const source = cleanText(args.sourceText);
  const fallback = `Read our ${product} review with key pros, tradeoffs, and live price context for ${category}.`;
  const text = source || fallback;
  return text.slice(0, 220);
}

export function buildDealsTitle(categoryPath: string, sourceLabel: string) {
  return `Best ${categoryLabel(categoryPath)} Deals on ${sourceLabel}`;
}

export function buildDealsExcerpt(categoryPath: string, sourceLabel: string) {
  return `Browse current ${sourceLabel} deals, standout picks, and quick-buy notes for ${categoryLabel(categoryPath).toLowerCase()}.`;
}

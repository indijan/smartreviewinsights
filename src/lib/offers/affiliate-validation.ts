import { OfferSource } from "@prisma/client";

export function validateAffiliateUrl(source: OfferSource, affiliateUrl: string, opts?: { amazonTrackingId?: string | null }) {
  try {
    const url = new URL(affiliateUrl);

    if (source === "AMAZON") {
      if (!url.hostname.includes("amazon.")) {
        return { ok: false, reason: "Amazon offer must point to an amazon.* URL" };
      }
      const tag = url.searchParams.get("tag");
      if (!tag) {
        return { ok: false, reason: "Amazon affiliate URL is missing tag parameter" };
      }
      if (opts?.amazonTrackingId && tag !== opts.amazonTrackingId) {
        return { ok: false, reason: `Amazon affiliate tag mismatch. expected=${opts.amazonTrackingId}, got=${tag}` };
      }
      return { ok: true as const };
    }

    const looksLikePlainSearch =
      url.hostname.includes("aliexpress.com") ||
      url.hostname.includes("temu.com") ||
      url.hostname.includes("alibaba.com") ||
      url.hostname.includes("ebay.com");
    if (looksLikePlainSearch) {
      return { ok: false, reason: `${source} offer is a plain direct URL, expected affiliate deep-link URL` };
    }
    return { ok: true as const };
  } catch {
    return { ok: false, reason: "Invalid affiliate URL" };
  }
}

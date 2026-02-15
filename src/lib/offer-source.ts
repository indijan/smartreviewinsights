export const OFFER_SOURCES = ["AMAZON", "ALIEXPRESS", "TEMU", "ALIBABA", "EBAY"] as const;

export type OfferSource = (typeof OFFER_SOURCES)[number];

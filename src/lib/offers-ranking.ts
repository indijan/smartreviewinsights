import type { OfferSource } from "@/lib/offer-source";

type RankedOfferInput = {
  id: string;
  source: OfferSource;
  title: string | null;
  price: { toString(): string } | null;
  currency: string;
  availability: string | null;
  affiliateUrl: string;
  partnerId: string | null;
  imageUrl: string | null;
  lastUpdated: Date | null;
  updatedAt: Date;
  createdAt: Date;
  partner: { hasApi: boolean; name: string } | null;
};

export type RankedOffer = {
  offer: RankedOfferInput;
  score: number;
  reason: string;
};

const SOURCE_PRIORITY: Record<OfferSource, number> = {
  AMAZON: 1.0,
  ALIEXPRESS: 0.85,
  TEMU: 0.75,
  ALIBABA: 0.72,
  EBAY: 0.7,
};

function freshnessScore(date: Date | null): number {
  if (!date) return 0.15;
  const ageMs = Date.now() - date.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  if (ageDays <= 1) return 1;
  if (ageDays <= 3) return 0.85;
  if (ageDays <= 7) return 0.65;
  if (ageDays <= 30) return 0.35;
  return 0.15;
}

function apiConfidence(partner: { hasApi: boolean } | null): number {
  if (!partner) return 0.3;
  return partner.hasApi ? 1 : 0.55;
}

export function rankOffers(offers: RankedOfferInput[]): RankedOffer[] {
  const ranked = offers.map((offer): RankedOffer => {
    const price = offer.price !== null ? Number(offer.price) : null;
    const hasPrice = price !== null && Number.isFinite(price);

    const fresh = freshnessScore(offer.lastUpdated ?? offer.updatedAt ?? null);
    const source = SOURCE_PRIORITY[offer.source] ?? 0.5;
    const api = apiConfidence(offer.partner);

    const score = hasPrice ? fresh * 0.45 + source * 0.35 + api * 0.2 : fresh * 0.4 + source * 0.4 + api * 0.2;

    let reason = "balanced";
    if (hasPrice) reason = "priced-offer";
    else if (!hasPrice) reason = "best-available-without-price";
    else if ((offer.partner?.hasApi ?? false) && fresh >= 0.65) reason = "fresh-api-source";

    return { offer, score, reason };
  });

  return ranked.sort((a, b) => {
    const aPrice = a.offer.price !== null ? Number(a.offer.price) : null;
    const bPrice = b.offer.price !== null ? Number(b.offer.price) : null;
    const aHas = aPrice !== null && Number.isFinite(aPrice);
    const bHas = bPrice !== null && Number.isFinite(bPrice);
    if (aHas && bHas && aPrice !== bPrice) return aPrice - bPrice;
    if (aHas !== bHas) return aHas ? -1 : 1;
    return b.score - a.score;
  });
}

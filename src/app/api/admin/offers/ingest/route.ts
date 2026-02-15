import { NextRequest, NextResponse } from "next/server";
import { getAdminTokenFromRequest, isAuthorizedAdmin } from "@/lib/admin";
import type { OfferSource } from "@/lib/offer-source";
import { ingestOfferItems, type OfferIngestItem } from "@/lib/offers/ingest";

function isOfferSource(v: string): v is OfferSource {
  return ["AMAZON", "ALIBABA", "ALIEXPRESS", "TEMU", "EBAY"].includes(v);
}

export async function POST(request: NextRequest) {
  if (!isAuthorizedAdmin(getAdminTokenFromRequest(request))) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { items?: Array<Record<string, unknown>> }
    | null;

  if (!body?.items || !Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ ok: false, error: "items[] is required" }, { status: 400 });
  }

  const items: OfferIngestItem[] = [];

  for (const raw of body.items) {
    const source = String(raw.source || "").toUpperCase();
    const externalId = String(raw.externalId || "").trim();
    const affiliateUrl = String(raw.affiliateUrl || "").trim();
    const productName = String(raw.productName || "").trim();

    if (!isOfferSource(source) || !externalId || !affiliateUrl || !productName) {
      return NextResponse.json(
        {
          ok: false,
          error: "Each item must have valid source, externalId, affiliateUrl, productName",
        },
        { status: 400 }
      );
    }

    items.push({
      source,
      externalId,
      affiliateUrl,
      productName,
      title: raw.title ? String(raw.title) : undefined,
      price: typeof raw.price === "number" ? raw.price : null,
      currency: raw.currency ? String(raw.currency) : "USD",
      imageUrl: raw.imageUrl ? String(raw.imageUrl) : null,
      availability: raw.availability ? String(raw.availability) : null,
      productCategory: raw.productCategory ? String(raw.productCategory) : null,
      pageSlug: raw.pageSlug ? String(raw.pageSlug) : null,
      partnerName: raw.partnerName ? String(raw.partnerName) : null,
      payload: raw.payload ?? raw,
    });
  }

  const result = await ingestOfferItems(items);
  return NextResponse.json({ ok: true, result });
}

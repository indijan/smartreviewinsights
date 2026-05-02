import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateSessionId, isLikelyBotRequest, normalizeOptionalSlug } from "@/lib/tracking";

export async function POST(request: NextRequest) {
  if (isLikelyBotRequest(request)) {
    return NextResponse.json({ ok: true, skipped: "bot" });
  }

  const body = await request.json().catch(() => null) as null | {
    offerSlug?: string;
    placementSlug?: string;
    ctaSlug?: string;
    pageSlug?: string;
    nicheSlug?: string;
  };

  const offerSlug = normalizeOptionalSlug(body?.offerSlug);
  const placementSlug = normalizeOptionalSlug(body?.placementSlug);
  const ctaSlug = normalizeOptionalSlug(body?.ctaSlug);
  const pageSlug = normalizeOptionalSlug(body?.pageSlug);
  const nicheSlug = normalizeOptionalSlug(body?.nicheSlug);

  if (!offerSlug && !placementSlug && !pageSlug) {
    return NextResponse.json({ ok: false, error: "missing-context" }, { status: 400 });
  }

  const [page, offer, placement, ctaVariant] = await Promise.all([
    pageSlug ? prisma.page.findUnique({ where: { slug: pageSlug }, select: { id: true } }) : null,
    offerSlug ? prisma.trafficOffer.findUnique({ where: { slug: offerSlug }, select: { id: true } }) : null,
    placementSlug ? prisma.trafficPlacement.findUnique({ where: { slug: placementSlug }, select: { id: true } }) : null,
    ctaSlug ? prisma.trafficCtaVariant.findUnique({ where: { slug: ctaSlug }, select: { id: true } }) : null,
  ]);

  const sessionId = getOrCreateSessionId(request);

  const existing = await prisma.impressionEvent.findFirst({
    where: {
      sessionId,
      pagePath: pageSlug || null,
      trafficOfferId: offer?.id,
      placementId: placement?.id,
      ctaVariantId: ctaVariant?.id,
      createdAt: { gte: new Date(Date.now() - 1000 * 60 * 60 * 6) },
    },
    select: { id: true },
  });

  if (existing) {
    return NextResponse.json({ ok: true, deduped: true });
  }

  await prisma.impressionEvent.create({
    data: {
      pageId: page?.id,
      trafficOfferId: offer?.id,
      placementId: placement?.id,
      ctaVariantId: ctaVariant?.id,
      sessionId,
      pagePath: pageSlug || null,
      nicheSlug: nicheSlug || null,
      viewportSeen: true,
    },
  });

  const response = NextResponse.json({ ok: true });
  response.cookies.set("sri_sid", sessionId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
  return response;
}

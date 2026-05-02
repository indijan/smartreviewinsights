import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeSlug } from "@/lib/slug";
import { buildClickBucketKey, getClickBucketDay, getClientIp, getDeviceType, getOrCreateSessionId, hashIp, isLikelyBotRequest } from "@/lib/tracking";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ offerId: string }> }
) {
  const { offerId } = await params;

  const nativeOffer = await prisma.offer.findUnique({
    where: { id: offerId },
    select: { id: true, affiliateUrl: true, source: true },
  });
  const trafficOffer = nativeOffer
    ? null
    : await prisma.trafficOffer.findUnique({
        where: { slug: offerId },
        select: { id: true, destinationUrl: true, trackingUrl: true, existingOfferId: true, niche: { select: { slug: true } } },
      });

  const offer = nativeOffer
    ? { id: nativeOffer.id, url: nativeOffer.affiliateUrl, source: nativeOffer.source, trafficOfferId: null as string | null, nicheSlug: null as string | null }
    : trafficOffer
      ? {
          id: trafficOffer.existingOfferId ?? null,
          url: trafficOffer.trackingUrl || trafficOffer.destinationUrl,
          source: "AMAZON" as const,
          trafficOfferId: trafficOffer.id,
          nicheSlug: trafficOffer.niche?.slug ?? null,
        }
      : null;

  if (!offer?.url) {
    return NextResponse.json({ ok: false, error: "offer not found" }, { status: 404 });
  }

  if (isLikelyBotRequest(request)) {
    return NextResponse.redirect(offer.url, 302);
  }

  const pageSlug = normalizeSlug(request.nextUrl.searchParams.get("page") ?? "");
  const placementSlug = normalizeSlug(request.nextUrl.searchParams.get("p") ?? "");
  const ctaSlug = normalizeSlug(request.nextUrl.searchParams.get("v") ?? "");
  const funnelSlug = normalizeSlug(request.nextUrl.searchParams.get("f") ?? "");
  const sessionId = getOrCreateSessionId(request);
  const userAgent = request.headers.get("user-agent") ?? "";
  const ipHash = hashIp(getClientIp(request));

  const page = pageSlug
    ? await prisma.page.findUnique({ where: { slug: pageSlug }, select: { id: true } })
    : null;
  const [placement, ctaVariant, funnel] = await Promise.all([
    placementSlug ? prisma.trafficPlacement.findUnique({ where: { slug: placementSlug }, select: { id: true } }) : null,
    ctaSlug ? prisma.trafficCtaVariant.findUnique({ where: { slug: ctaSlug }, select: { id: true } }) : null,
    funnelSlug ? prisma.trafficFunnel.findUnique({ where: { slug: funnelSlug }, select: { id: true } }) : null,
  ]);
  const outboundUrl = new URL(offer.url);
  const subid = [sessionId, offer.trafficOfferId ?? offer.id ?? "native", placement?.id ?? "direct"].join("-");
  outboundUrl.searchParams.set("subid", subid);
  if (offer.nicheSlug) outboundUrl.searchParams.set("sri_niche", offer.nicheSlug);
  if (funnelSlug) outboundUrl.searchParams.set("sri_funnel", funnelSlug);

  const day = getClickBucketDay();
  await prisma.clickAggregate.upsert({
    where: {
      bucketKey: buildClickBucketKey({
        day,
        source: offer.source,
        pageId: page?.id,
        offerId: offer.id,
      }),
    },
    create: {
      bucketKey: buildClickBucketKey({
        day,
        source: offer.source,
        pageId: page?.id,
        offerId: offer.id,
      }),
      day: new Date(`${day}T00:00:00.000Z`),
      offerId: offer.id,
      pageId: page?.id,
      source: offer.source,
      clicks: 1,
    },
    update: {
      clicks: { increment: 1 },
      updatedAt: new Date(),
    },
  });

  await prisma.clickEvent.create({
    data: {
      pageId: page?.id,
      offerId: offer.id,
      trafficOfferId: offer.trafficOfferId,
      source: offer.source,
      userAgent,
      ipHash,
      sessionId,
      pagePath: pageSlug || null,
      nicheSlug: offer.nicheSlug,
      funnelId: funnel?.id,
      placementId: placement?.id,
      ctaVariantId: ctaVariant?.id,
      outboundUrl: outboundUrl.toString(),
      utmSource: request.nextUrl.searchParams.get("utm_source"),
      utmMedium: request.nextUrl.searchParams.get("utm_medium"),
      utmCampaign: request.nextUrl.searchParams.get("utm_campaign"),
      utmContent: request.nextUrl.searchParams.get("utm_content"),
      deviceType: getDeviceType(userAgent),
      referrerUrl: request.headers.get("referer"),
      ref: request.nextUrl.searchParams.get("ref"),
    },
  });

  const response = NextResponse.redirect(outboundUrl.toString(), 302);
  response.cookies.set("sri_sid", sessionId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
  return response;
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeSlug } from "@/lib/slug";
import { getClientIp, hashIp } from "@/lib/tracking";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ offerId: string }> }
) {
  const { offerId } = await params;

  const offer = await prisma.offer.findUnique({
    where: { id: offerId },
    select: { id: true, affiliateUrl: true, source: true },
  });

  if (!offer) {
    return NextResponse.json({ ok: false, error: "offer not found" }, { status: 404 });
  }

  const pageSlug = normalizeSlug(request.nextUrl.searchParams.get("page") ?? "");
  const ref = (request.nextUrl.searchParams.get("ref") ?? "offer-click").slice(0, 200);

  const page = pageSlug
    ? await prisma.page.findUnique({ where: { slug: pageSlug }, select: { id: true } })
    : null;

  await prisma.clickEvent.create({
    data: {
      offerId: offer.id,
      pageId: page?.id,
      source: offer.source,
      ref,
      userAgent: request.headers.get("user-agent")?.slice(0, 500) || null,
      ipHash: hashIp(getClientIp(request)),
    },
  });

  return NextResponse.redirect(offer.affiliateUrl, 302);
}

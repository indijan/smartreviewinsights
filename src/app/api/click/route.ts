import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeSlug } from "@/lib/slug";
import { buildClickBucketKey, getClickBucketDay, isLikelyBotRequest } from "@/lib/tracking";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as
    | { offerId?: string; pageSlug?: string }
    | null;

  if (!body?.offerId) {
    return NextResponse.json({ ok: false, error: "offerId is required" }, { status: 400 });
  }

  const offer = await prisma.offer.findUnique({
    where: { id: body.offerId },
    select: { id: true, source: true },
  });

  if (!offer) {
    return NextResponse.json({ ok: false, error: "offer not found" }, { status: 404 });
  }

  if (isLikelyBotRequest(request)) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const pageSlug = body.pageSlug ? normalizeSlug(body.pageSlug) : null;
  const page = pageSlug
    ? await prisma.page.findUnique({ where: { slug: pageSlug }, select: { id: true } })
    : null;

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

  return NextResponse.json({ ok: true });
}

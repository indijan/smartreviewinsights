import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeSlug } from "@/lib/slug";
import { getClientIp, hashIp } from "@/lib/tracking";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as
    | { offerId?: string; pageSlug?: string; ref?: string }
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

  const pageSlug = body.pageSlug ? normalizeSlug(body.pageSlug) : null;
  const page = pageSlug
    ? await prisma.page.findUnique({ where: { slug: pageSlug }, select: { id: true } })
    : null;

  await prisma.clickEvent.create({
    data: {
      offerId: offer.id,
      pageId: page?.id,
      source: offer.source,
      ref: body.ref?.slice(0, 200) || null,
      userAgent: request.headers.get("user-agent")?.slice(0, 500) || null,
      ipHash: hashIp(getClientIp(request)),
    },
  });

  return NextResponse.json({ ok: true });
}

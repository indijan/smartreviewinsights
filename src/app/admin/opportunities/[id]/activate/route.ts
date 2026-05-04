import { NextRequest, NextResponse } from "next/server";
import { isAdminSession } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { normalizeSlugValue } from "@/lib/traffic-lab";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminSession())) {
    return NextResponse.redirect(new URL("/admin/login", request.url), 302);
  }

  const { id } = await params;
  const form = await request.formData();
  const outboundUrl = String(form.get("outboundUrl") || "").trim();
  const label = String(form.get("label") || "See Recommended Options").trim() || "See Recommended Options";
  const days = String(form.get("days") || "30");
  const site = String(form.get("site") || "").trim();
  const selectedSlots = form.getAll("slots").map((value) => String(value)).filter(Boolean);

  if (!outboundUrl) {
    const query = new URLSearchParams({ days, error: "missing-url" });
    if (site) query.set("site", site);
    return NextResponse.redirect(new URL(`/admin/opportunities/${id}?${query.toString()}`, request.url), 302);
  }

  const page = await prisma.page.findUnique({
    where: { id },
    select: { id: true, slug: true, title: true, productId: true },
  });
  if (!page) {
    const query = new URLSearchParams({ days });
    if (site) query.set("site", site);
    return NextResponse.redirect(new URL(`/admin/opportunities?${query.toString()}`, request.url), 302);
  }

  const baseSlug = normalizeSlugValue(page.slug.replace(/\//g, "-"));
  const offer = await prisma.trafficOffer.upsert({
    where: { slug: `opportunity-${baseSlug}` },
    create: {
      name: `${page.title} Exit Path`,
      slug: `opportunity-${baseSlug}`,
      offerType: "outbound_click",
      destinationUrl: outboundUrl,
      network: "manual_exit",
      commissionType: "cpc",
      status: "active",
      disclosureRequired: false,
      notes: `Activated from opportunity dashboard for page ${page.slug}`,
    },
    update: {
      name: `${page.title} Exit Path`,
      destinationUrl: outboundUrl,
      network: "manual_exit",
      commissionType: "cpc",
      status: "active",
      disclosureRequired: false,
      notes: `Activated from opportunity dashboard for page ${page.slug}`,
    },
    select: { id: true },
  });

  const placements = [
    {
      name: `${page.title} Mid Exit`,
      slug: `mid-exit-${baseSlug}`,
      placementType: "inline_card",
      weight: 100,
      slot: "MID_ARTICLE",
    },
    {
      name: `${page.title} Bottom Exit`,
      slug: `bottom-exit-${baseSlug}`,
      placementType: "quiz_result_cta",
      weight: 90,
      slot: "BOTTOM_EXIT",
    },
    {
      name: `${page.title} Sticky Exit`,
      slug: `sticky-exit-${baseSlug}`,
      placementType: "sticky_bottom_mobile",
      weight: 70,
      slot: "MOBILE_STICKY",
    },
  ];

  const enabledSlots = new Set(selectedSlots.length ? selectedSlots : placements.map((p) => p.slot));

  for (const placement of placements) {
    const placementRecord = await prisma.trafficPlacement.upsert({
      where: { slug: placement.slug },
      create: {
        name: placement.name,
        slug: placement.slug,
        pageId: page.id,
        placementType: placement.placementType,
        weight: placement.weight,
        status: enabledSlots.has(placement.slot) ? "active" : "paused",
        offers: {
          create: [{ offerId: offer.id }],
        },
      },
      update: {
        pageId: page.id,
        name: placement.name,
        placementType: placement.placementType,
        weight: placement.weight,
        status: enabledSlots.has(placement.slot) ? "active" : "paused",
      },
      select: { id: true },
    });
    await prisma.trafficPlacementOnOffer.upsert({
      where: {
        placementId_offerId: {
          placementId: placementRecord.id,
          offerId: offer.id,
        },
      },
      create: {
        placementId: placementRecord.id,
        offerId: offer.id,
      },
      update: {},
    });
  }

  const ctaSlug = `cta-${baseSlug}`;
  await prisma.trafficCtaVariant.upsert({
    where: { slug: ctaSlug },
    create: {
      slug: ctaSlug,
      ctaText: label,
      buttonText: label,
      angle: "compare_now",
      status: "active",
    },
    update: {
      ctaText: label,
      buttonText: label,
      status: "active",
    },
  });

  const query = new URLSearchParams({ days, activated: "1" });
  if (site) query.set("site", site);
  return NextResponse.redirect(new URL(`/admin/opportunities/${id}?${query.toString()}`, request.url), 302);
}

import { NextRequest, NextResponse } from "next/server";
import { isAdminSession } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { buildTrafficDraft } from "@/lib/traffic-content-builder";

export async function POST(request: NextRequest) {
  if (!(await isAdminSession())) return NextResponse.redirect(new URL("/admin/login", request.url), 302);

  const formData = await request.formData();
  const nicheId = String(formData.get("nicheId") ?? "");
  const angle = String(formData.get("angle") ?? "compare_now");
  const contentType = String(formData.get("contentType") ?? "entry_article");
  const titleSeed = String(formData.get("titleSeed") ?? "").trim();
  const internalLinkIds = formData.getAll("internalLinkIds").map(String).filter(Boolean);
  const trafficOfferIds = formData.getAll("trafficOfferIds").map(String).filter(Boolean);

  if (!nicheId || !titleSeed) {
    return NextResponse.redirect(new URL("/admin/traffic-lab/content-builder?error=missing-fields", request.url), 302);
  }

  const [niche, internalLinks, trafficOffers] = await Promise.all([
    prisma.trafficNiche.findUnique({ where: { id: nicheId }, select: { id: true, name: true, slug: true } }),
    prisma.page.findMany({ where: { id: { in: internalLinkIds } }, select: { title: true, slug: true } }),
    prisma.trafficOffer.findMany({ where: { id: { in: trafficOfferIds } }, select: { name: true, slug: true, offerType: true } }),
  ]);

  if (!niche) {
    return NextResponse.redirect(new URL("/admin/traffic-lab/content-builder?error=missing-niche", request.url), 302);
  }

  const draft = buildTrafficDraft({
    nicheName: niche.name,
    nicheSlug: niche.slug,
    angle,
    contentType,
    titleSeed,
    internalLinks,
    offerSnippets: trafficOffers.map((offer) => `${offer.name} (${offer.slug}) · ${offer.offerType}`),
  });

  const existing = await prisma.page.findUnique({ where: { slug: draft.slug }, select: { id: true } });
  if (existing) {
    return NextResponse.redirect(new URL(`/admin/posts/${existing.id}?duplicateSlug=1`, request.url), 302);
  }

  const page = await prisma.page.create({
    data: {
      slug: draft.slug,
      type: draft.pageType as "ARTICLE" | "REVIEW" | "LANDING",
      title: draft.title,
      excerpt: draft.excerpt,
      contentMd: draft.contentMd,
      status: "DRAFT",
    },
    select: { id: true },
  });

  return NextResponse.redirect(new URL(`/admin/posts/${page.id}?generated=1`, request.url), 302);
}

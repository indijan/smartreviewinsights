import { NextRequest, NextResponse } from "next/server";
import { PageStatus } from "@prisma/client";
import { validateAffiliateUrl } from "@/lib/offers/affiliate-validation";
import { isAdminSession } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminSession())) {
    return NextResponse.redirect(new URL("/admin/login", request.url), 302);
  }

  const { id } = await params;
  const form = await request.formData();
  const title = String(form.get("title") || "").trim();
  const slug = String(form.get("slug") || "").trim().replace(/^\/+|\/+$/g, "");
  const excerptRaw = String(form.get("excerpt") || "");
  const contentMd = String(form.get("contentMd") || "").trim();
  const status = String(form.get("status") || "DRAFT").toUpperCase() === "PUBLISHED" ? PageStatus.PUBLISHED : PageStatus.DRAFT;

  if (!title || !slug || !contentMd) {
    return NextResponse.redirect(new URL(`/admin/posts/${id}`, request.url), 302);
  }

  if (status === PageStatus.PUBLISHED) {
    const pageWithOffers = await prisma.page.findUnique({
      where: { id },
      include: {
        product: {
          include: {
            offers: {
              where: {
                OR: [{ partnerId: null }, { partner: { isEnabled: true } }],
              },
            },
          },
        },
      },
    });

    const offers = pageWithOffers?.product?.offers ?? [];
    if (offers.length === 0) {
      return NextResponse.redirect(new URL(`/admin/posts/${id}?error=no-offers`, request.url), 302);
    }

    const amazonTag = process.env.AMAZON_CREATOR_PARTNER_TAG || process.env.AMAZON_PAAPI_PARTNER_TAG || null;
    const bad = offers.find((o) => !validateAffiliateUrl(o.source, o.affiliateUrl, { amazonTrackingId: amazonTag }).ok);
    if (bad) {
      return NextResponse.redirect(new URL(`/admin/posts/${id}?error=invalid-affiliate`, request.url), 302);
    }
  }

  await prisma.page.update({
    where: { id },
    data: {
      title,
      slug,
      excerpt: excerptRaw.trim() || null,
      contentMd,
      status,
      publishedAt: status === PageStatus.PUBLISHED ? new Date() : null,
    },
  });

  return NextResponse.redirect(new URL(`/admin/posts/${id}`, request.url), 302);
}

import { NextRequest, NextResponse } from "next/server";
import { isAdminSession } from "@/lib/admin";
import type { OfferSource } from "@/lib/offer-source";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  if (!(await isAdminSession())) {
    return NextResponse.redirect(new URL("/admin/login", request.url), 302);
  }

  const form = await request.formData();
  const label = String(form.get("label") || "eBay account").trim();
  const trackingId = String(form.get("trackingId") || "").trim() || null;
  const deepLinkPattern = String(form.get("deepLinkPattern") || "").trim() || null;

  const partner = await prisma.partner.upsert({
    where: { name_source: { name: "eBay", source: "EBAY" } },
    update: { isEnabled: true },
    create: {
      name: "eBay",
      source: "EBAY",
      websiteUrl: "https://www.ebay.com",
      hasApi: false,
      isEnabled: true,
      notes: "Competitor marketplace partner",
    },
  });

  if (deepLinkPattern || trackingId) {
    await prisma.affiliateAccount.create({
      data: {
        partnerId: partner.id,
        label,
        trackingId,
        deepLinkPattern,
        isActive: true,
      },
    });
  }

  return NextResponse.redirect(new URL("/admin/affiliates", request.url), 302);
}

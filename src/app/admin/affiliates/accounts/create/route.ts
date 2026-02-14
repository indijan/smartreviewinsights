import { NextRequest, NextResponse } from "next/server";
import { isAdminSession } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  if (!(await isAdminSession())) {
    return NextResponse.redirect(new URL("/admin/login", request.url), 302);
  }

  const form = await request.formData();
  const partnerId = String(form.get("partnerId") || "").trim();
  const label = String(form.get("label") || "").trim();
  const trackingId = String(form.get("trackingId") || "").trim() || null;
  const deepLinkPattern = String(form.get("deepLinkPattern") || "").trim() || null;
  const isActive = form.get("isActive") === "on";

  if (!partnerId || !label) {
    return NextResponse.redirect(new URL("/admin/affiliates?error=partner-account-required", request.url), 302);
  }

  await prisma.affiliateAccount.create({
    data: {
      partnerId,
      label,
      trackingId,
      deepLinkPattern,
      isActive,
    },
  });

  return NextResponse.redirect(new URL("/admin/affiliates?saved=new-account", request.url), 302);
}

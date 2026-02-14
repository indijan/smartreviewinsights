import { NextRequest, NextResponse } from "next/server";
import { isAdminSession } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminSession())) {
    return NextResponse.redirect(new URL("/admin/login", request.url), 302);
  }

  const { id } = await params;
  const form = await request.formData();
  const label = String(form.get("label") || "").trim();
  const trackingId = String(form.get("trackingId") || "").trim() || null;
  const deepLinkPattern = String(form.get("deepLinkPattern") || "").trim() || null;
  const isActive = form.get("isActive") === "on";

  if (!label) {
    return NextResponse.redirect(new URL(`/admin/affiliates?error=account-label-required&id=${encodeURIComponent(id)}`, request.url), 302);
  }

  await prisma.affiliateAccount.update({
    where: { id },
    data: {
      label,
      trackingId,
      deepLinkPattern,
      isActive,
    },
  });

  return NextResponse.redirect(new URL("/admin/affiliates?saved=account", request.url), 302);
}

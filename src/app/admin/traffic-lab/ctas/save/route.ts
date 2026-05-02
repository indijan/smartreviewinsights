import { NextRequest, NextResponse } from "next/server";
import { isAdminSession } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { normalizeSlugValue } from "@/lib/traffic-lab";

export async function POST(request: NextRequest) {
  if (!(await isAdminSession())) return NextResponse.redirect(new URL("/admin/login", request.url), 302);
  const form = await request.formData();
  const ctaText = String(form.get("ctaText") || "").trim();
  const buttonText = String(form.get("buttonText") || "").trim();
  if (!ctaText || !buttonText) return NextResponse.redirect(new URL("/admin/traffic-lab/ctas", request.url), 302);
  await prisma.trafficCtaVariant.create({
    data: {
      slug: normalizeSlugValue(String(form.get("slug") || ctaText)),
      ctaText,
      ctaSubtext: String(form.get("ctaSubtext") || "").trim() || null,
      buttonText,
      angle: String(form.get("angle") || "compare_now").trim(),
      status: String(form.get("status") || "active").trim(),
    },
  });
  return NextResponse.redirect(new URL("/admin/traffic-lab/ctas", request.url), 302);
}

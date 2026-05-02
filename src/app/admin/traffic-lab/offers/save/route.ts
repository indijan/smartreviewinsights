import { NextRequest, NextResponse } from "next/server";
import { isAdminSession } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { normalizeSlugValue } from "@/lib/traffic-lab";

export async function POST(request: NextRequest) {
  if (!(await isAdminSession())) return NextResponse.redirect(new URL("/admin/login", request.url), 302);
  const form = await request.formData();
  const name = String(form.get("name") || "").trim();
  const destinationUrl = String(form.get("destinationUrl") || "").trim();
  if (!name || !destinationUrl) return NextResponse.redirect(new URL("/admin/traffic-lab/offers", request.url), 302);
  await prisma.trafficOffer.create({
    data: {
      name,
      slug: normalizeSlugValue(String(form.get("slug") || name)),
      nicheId: String(form.get("nicheId") || "").trim() || null,
      offerType: String(form.get("offerType") || "affiliate").trim(),
      destinationUrl,
      trackingUrl: String(form.get("trackingUrl") || "").trim() || null,
      network: String(form.get("network") || "").trim() || null,
      commissionType: String(form.get("commissionType") || "").trim() || null,
      estimatedEpc: String(form.get("estimatedEpc") || "").trim() || null,
      geo: String(form.get("geo") || "").trim() || null,
      device: String(form.get("device") || "").trim() || null,
      status: String(form.get("status") || "active").trim(),
      disclosureRequired: form.get("disclosureRequired") === "on",
      notes: String(form.get("notes") || "").trim() || null,
    },
  });
  return NextResponse.redirect(new URL("/admin/traffic-lab/offers", request.url), 302);
}

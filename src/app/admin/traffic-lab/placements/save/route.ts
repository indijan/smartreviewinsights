import { NextRequest, NextResponse } from "next/server";
import { isAdminSession } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { normalizeSlugValue } from "@/lib/traffic-lab";

export async function POST(request: NextRequest) {
  if (!(await isAdminSession())) return NextResponse.redirect(new URL("/admin/login", request.url), 302);
  const form = await request.formData();
  const name = String(form.get("name") || "").trim();
  if (!name) return NextResponse.redirect(new URL("/admin/traffic-lab/placements", request.url), 302);
  const offerIds = form.getAll("offerIds").map((value) => String(value)).filter(Boolean);
  await prisma.trafficPlacement.create({
    data: {
      name,
      slug: normalizeSlugValue(String(form.get("slug") || name)),
      pageId: String(form.get("pageId") || "").trim() || null,
      placementType: String(form.get("placementType") || "inline_card").trim(),
      weight: Number(form.get("weight") || 100),
      maxImpressionsPerSession: Number(form.get("maxImpressionsPerSession") || 0) || null,
      status: String(form.get("status") || "active").trim(),
      offers: {
        create: offerIds.map((offerId) => ({ offerId })),
      },
    },
  });
  return NextResponse.redirect(new URL("/admin/traffic-lab/placements", request.url), 302);
}

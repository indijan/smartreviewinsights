import { NextRequest, NextResponse } from "next/server";
import { isAdminSession } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  if (!(await isAdminSession())) return NextResponse.redirect(new URL("/admin/login", request.url), 302);
  const form = await request.formData();
  const date = String(form.get("date") || "").trim();
  const source = String(form.get("source") || "").trim();
  const campaignName = String(form.get("campaignName") || "").trim();
  const spend = String(form.get("spend") || "").trim();
  if (!date || !source || !campaignName || !spend) return NextResponse.redirect(new URL("/admin/traffic-lab/costs", request.url), 302);
  await prisma.trafficCampaignCost.create({
    data: {
      nicheId: String(form.get("nicheId") || "").trim() || null,
      date: new Date(`${date}T00:00:00.000Z`),
      source,
      campaignName,
      utmCampaign: String(form.get("utmCampaign") || "").trim() || null,
      spend,
      clicks: Number(form.get("clicks") || 0),
      cpc: String(form.get("cpc") || "").trim() || null,
      notes: String(form.get("notes") || "").trim() || null,
    },
  });
  return NextResponse.redirect(new URL("/admin/traffic-lab/costs", request.url), 302);
}

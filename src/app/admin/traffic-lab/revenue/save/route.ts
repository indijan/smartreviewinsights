import { NextRequest, NextResponse } from "next/server";
import { isAdminSession } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  if (!(await isAdminSession())) return NextResponse.redirect(new URL("/admin/login", request.url), 302);
  const form = await request.formData();
  const date = String(form.get("date") || "").trim();
  const source = String(form.get("source") || "").trim();
  const revenue = String(form.get("revenue") || "").trim();
  if (!date || !source || !revenue) return NextResponse.redirect(new URL("/admin/traffic-lab/revenue", request.url), 302);
  await prisma.trafficRevenueImport.create({
    data: {
      nicheId: String(form.get("nicheId") || "").trim() || null,
      date: new Date(`${date}T00:00:00.000Z`),
      source,
      pagePath: String(form.get("pagePath") || "").trim() || null,
      revenue,
      clicks: Number(form.get("clicks") || 0),
      impressions: Number(form.get("impressions") || 0),
      rpm: String(form.get("rpm") || "").trim() || null,
      epc: String(form.get("epc") || "").trim() || null,
      notes: String(form.get("notes") || "").trim() || null,
    },
  });
  return NextResponse.redirect(new URL("/admin/traffic-lab/revenue", request.url), 302);
}

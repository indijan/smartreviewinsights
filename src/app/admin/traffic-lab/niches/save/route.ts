import { NextRequest, NextResponse } from "next/server";
import { isAdminSession } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { normalizeSlugValue } from "@/lib/traffic-lab";

export async function POST(request: NextRequest) {
  if (!(await isAdminSession())) return NextResponse.redirect(new URL("/admin/login", request.url), 302);
  const form = await request.formData();
  const name = String(form.get("name") || "").trim();
  if (!name) return NextResponse.redirect(new URL("/admin/traffic-lab/niches", request.url), 302);
  await prisma.trafficNiche.create({
    data: {
      name,
      slug: normalizeSlugValue(String(form.get("slug") || name)),
      description: String(form.get("description") || "").trim() || null,
      status: String(form.get("status") || "draft").trim(),
      primaryMonetization: String(form.get("primaryMonetization") || "mixed").trim(),
      riskLevel: String(form.get("riskLevel") || "low").trim(),
      targetGeography: String(form.get("targetGeography") || "").trim() || null,
      notes: String(form.get("notes") || "").trim() || null,
    },
  });
  return NextResponse.redirect(new URL("/admin/traffic-lab/niches", request.url), 302);
}

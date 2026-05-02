import { NextRequest, NextResponse } from "next/server";
import { isAdminSession } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { normalizeSlugValue } from "@/lib/traffic-lab";

function parseJsonArray(input: string) {
  try {
    const parsed = JSON.parse(input);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  if (!(await isAdminSession())) return NextResponse.redirect(new URL("/admin/login", request.url), 302);
  const form = await request.formData();
  const name = String(form.get("name") || "").trim();
  const nicheId = String(form.get("nicheId") || "").trim();
  if (!name || !nicheId) return NextResponse.redirect(new URL("/admin/traffic-lab/funnels", request.url), 302);
  await prisma.trafficFunnel.create({
    data: {
      name,
      slug: normalizeSlugValue(String(form.get("slug") || name)),
      nicheId,
      entryPageId: String(form.get("entryPageId") || "").trim() || null,
      quizPageId: String(form.get("quizPageId") || "").trim() || null,
      deepPageIds: parseJsonArray(String(form.get("deepPageIds") || "")) ?? [],
      comparisonPageIds: parseJsonArray(String(form.get("comparisonPageIds") || "")) ?? [],
      status: String(form.get("status") || "draft").trim(),
      targetCpc: String(form.get("targetCpc") || "").trim() || null,
      targetRpm: String(form.get("targetRpm") || "").trim() || null,
      targetEpv: String(form.get("targetEpv") || "").trim() || null,
    },
  });
  return NextResponse.redirect(new URL("/admin/traffic-lab/funnels", request.url), 302);
}

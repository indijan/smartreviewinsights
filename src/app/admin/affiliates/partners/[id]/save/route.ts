import { NextRequest, NextResponse } from "next/server";
import { isAdminSession } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminSession())) {
    return NextResponse.redirect(new URL("/admin/login", request.url), 302);
  }

  const { id } = await params;
  const form = await request.formData();
  const name = String(form.get("name") || "").trim();
  const websiteUrl = String(form.get("websiteUrl") || "").trim() || null;
  const notes = String(form.get("notes") || "").trim() || null;
  const hasApi = form.get("hasApi") === "on";
  const isEnabled = form.get("isEnabled") === "on";

  if (!name) {
    return NextResponse.redirect(new URL(`/admin/affiliates?error=partner-name-required&id=${encodeURIComponent(id)}`, request.url), 302);
  }

  await prisma.partner.update({
    where: { id },
    data: {
      name,
      websiteUrl,
      notes,
      hasApi,
      isEnabled,
    },
  });

  return NextResponse.redirect(new URL("/admin/affiliates?saved=partner", request.url), 302);
}

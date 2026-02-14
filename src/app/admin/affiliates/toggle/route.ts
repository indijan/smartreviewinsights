import { NextRequest, NextResponse } from "next/server";
import { isAdminSession } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  if (!(await isAdminSession())) {
    return NextResponse.redirect(new URL("/admin/login", request.url), 302);
  }

  const form = await request.formData();
  const partnerId = String(form.get("partnerId") || "");
  const enabled = String(form.get("enabled") || "1") === "1";
  if (!partnerId) {
    return NextResponse.redirect(new URL("/admin/affiliates?error=missing-partner", request.url), 302);
  }

  await prisma.partner.update({
    where: { id: partnerId },
    data: { isEnabled: enabled },
  });

  return NextResponse.redirect(new URL("/admin/affiliates", request.url), 302);
}

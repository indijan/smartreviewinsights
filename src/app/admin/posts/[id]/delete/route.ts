import { NextRequest, NextResponse } from "next/server";
import { isAdminSession } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminSession())) {
    return NextResponse.redirect(new URL("/admin/login", request.url), 302);
  }

  const { id } = await params;

  await prisma.pageTag.deleteMany({ where: { pageId: id } });
  await prisma.clickEvent.deleteMany({ where: { pageId: id } });
  await prisma.page.delete({ where: { id } });

  return NextResponse.redirect(new URL("/admin/posts", request.url), 302);
}

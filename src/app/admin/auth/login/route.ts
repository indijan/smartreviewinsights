import { NextRequest, NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, isAuthorizedAdmin } from "@/lib/admin";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const token = String(formData.get("token") || "");

  if (!isAuthorizedAdmin(token)) {
    return NextResponse.redirect(new URL("/admin/login", request.url), 302);
  }

  const response = NextResponse.redirect(new URL("/admin/affiliates", request.url), 302);
  response.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
  return response;
}

import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

export const ADMIN_SESSION_COOKIE = "sri_admin_session";

export function isAuthorizedAdmin(token: string | undefined): boolean {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) {
    return false;
  }
  return token === expected;
}

export async function isAdminSession(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  return isAuthorizedAdmin(token);
}

export function getAdminTokenFromRequest(request: NextRequest): string | undefined {
  return (
    request.headers.get("x-admin-token") ??
    request.nextUrl.searchParams.get("token") ??
    request.cookies.get(ADMIN_SESSION_COOKIE)?.value ??
    undefined
  );
}

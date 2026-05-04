import { NextRequest, NextResponse } from "next/server";
import { completeSearchConsoleConnection } from "@/lib/search-console";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");

  if (!code || !state) {
    return NextResponse.redirect(new URL("/admin/opportunities?gscError=missing-code", request.url), { status: 303 });
  }

  try {
    const result = await completeSearchConsoleConnection(code, state);
    return NextResponse.redirect(new URL(`${result.returnTo}?gscConnected=1`, request.url), { status: 303 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Search Console callback failed.";
    return NextResponse.redirect(
      new URL(`/admin/opportunities?gscError=${encodeURIComponent(message)}`, request.url),
      { status: 303 },
    );
  }
}

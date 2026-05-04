import { NextRequest, NextResponse } from "next/server";
import { createSearchConsoleConnectUrl } from "@/lib/search-console";

export async function GET(request: NextRequest) {
  const returnTo = request.nextUrl.searchParams.get("returnTo");

  try {
    return NextResponse.redirect(createSearchConsoleConnectUrl(returnTo), { status: 303 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Search Console connection failed.";
    return NextResponse.redirect(
      new URL(`/admin/opportunities?gscError=${encodeURIComponent(message)}`, request.url),
      { status: 303 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { clearSearchConsoleSession } from "@/lib/search-console";

export async function POST(request: NextRequest) {
  await clearSearchConsoleSession();
  return NextResponse.redirect(new URL("/admin/opportunities?gscDisconnected=1", request.url), {
    status: 303,
  });
}

import { NextRequest, NextResponse } from "next/server";
import { isAdminSession } from "@/lib/admin";
import { runAutopostCronJob } from "@/lib/cron-jobs";

export async function POST(request: NextRequest) {
  if (!(await isAdminSession())) {
    return NextResponse.redirect(new URL("/admin/login", request.url), 302);
  }

  await runAutopostCronJob();
  return NextResponse.redirect(new URL("/admin/automation", request.url), 302);
}

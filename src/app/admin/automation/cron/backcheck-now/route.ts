import { NextRequest, NextResponse } from "next/server";
import { isAdminSession } from "@/lib/admin";
import { runMonthlyPriceBackcheckCronJob } from "@/lib/cron-jobs";

export async function POST(request: NextRequest) {
  if (!(await isAdminSession())) {
    return NextResponse.redirect(new URL("/admin/login", request.url), 302);
  }

  await runMonthlyPriceBackcheckCronJob();
  return NextResponse.redirect(new URL("/admin/automation", request.url), 302);
}

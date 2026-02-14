import { NextRequest, NextResponse } from "next/server";
import { isAdminSession } from "@/lib/admin";
import { getAmazonSearchDebugInfo, searchAmazonItems } from "@/lib/providers/amazon-paapi";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  if (!(await isAdminSession())) {
    return NextResponse.redirect(new URL("/admin/login", request.url), 302);
  }

  const run = await prisma.automationRun.create({
    data: {
      source: "AMAZON",
      status: "QUEUED",
      message: "Amazon connection test started.",
      itemsSeen: 0,
      itemsPosted: 0,
    },
  });

  if (process.env.AMAZON_API_ENABLED !== "1") {
    await prisma.automationRun.update({
      where: { id: run.id },
      data: {
        status: "SKIPPED",
        message: "Amazon API test skipped because AMAZON_API_ENABLED is not set to 1 (link mode active).",
        finishedAt: new Date(),
      },
    });
    return NextResponse.redirect(new URL("/admin/automation", request.url), 302);
  }

  try {
    const debug = getAmazonSearchDebugInfo();
    const items = await searchAmazonItems({
      keywords: "smart watch",
      maxItems: 3,
    });

    await prisma.automationRun.update({
      where: { id: run.id },
      data: {
        status: "SUCCESS",
        itemsSeen: items.length,
        itemsPosted: 0,
        message:
          items.length > 0
            ? `Amazon connection OK. Retrieved ${items.length} test item(s). endpoint=${debug.endpoint}, authEndpoints=${debug.authEndpoints}, authorization='${debug.authorizationHeaderFormat}', marketplace=${debug.marketplace}, credentialId=${debug.credentialIdPrefix}`
            : `Amazon request succeeded, but returned 0 items. endpoint=${debug.endpoint}, authEndpoints=${debug.authEndpoints}, authorization='${debug.authorizationHeaderFormat}', marketplace=${debug.marketplace}, credentialId=${debug.credentialIdPrefix}`,
        finishedAt: new Date(),
      },
    });
  } catch (error) {
    const debug = getAmazonSearchDebugInfo();
    const message = error instanceof Error ? error.message : "Amazon connection test failed";
    await prisma.automationRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        message: `Amazon connection test failed: ${message}. endpoint=${debug.endpoint}, authEndpoints=${debug.authEndpoints}, authorization='${debug.authorizationHeaderFormat}', marketplace=${debug.marketplace}, credentialId=${debug.credentialIdPrefix}`,
        finishedAt: new Date(),
      },
    });
  }

  return NextResponse.redirect(new URL("/admin/automation", request.url), 302);
}

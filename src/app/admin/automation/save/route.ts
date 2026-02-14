import { OfferSource } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { isAdminSession } from "@/lib/admin";
import { ensureDefaultNichesForSource } from "@/lib/automation-niches";
import { prisma } from "@/lib/prisma";

const SOURCES: OfferSource[] = ["AMAZON", "ALIEXPRESS", "TEMU", "ALIBABA", "EBAY"];

export async function POST(request: NextRequest) {
  if (!(await isAdminSession())) {
    return NextResponse.redirect(new URL("/admin/login", request.url), 302);
  }

  const form = await request.formData();
  const sourceRaw = String(form.get("source") || "AMAZON").toUpperCase();
  const source = SOURCES.includes(sourceRaw as OfferSource) ? (sourceRaw as OfferSource) : "AMAZON";

  const maxPostsPerRun = Math.max(1, Math.min(200, Number(form.get("maxPostsPerRun") || 5) || 5));
  const minPriceRaw = String(form.get("minPriceUsd") || "").trim();

  const existing = await prisma.automationConfig.findFirst({ orderBy: { updatedAt: "desc" }, select: { id: true } });

  const data = {
    isEnabled: form.get("isEnabled") === "on",
    autoPostEnabled: form.get("autoPostEnabled") === "on",
    aiRewriteEnabled: form.get("aiRewriteEnabled") === "on",
    source,
    publishMode: String(form.get("publishMode") || "DRAFT").toUpperCase() === "PUBLISHED" ? "PUBLISHED" : "DRAFT",
    maxPostsPerRun,
    minPriceUsd: minPriceRaw ? Number(minPriceRaw) : null,
    promptTemplate: String(form.get("promptTemplate") || "").trim() || null,
  };

  if (existing?.id) {
    await prisma.automationConfig.update({ where: { id: existing.id }, data });
  } else {
    await prisma.automationConfig.create({ data });
  }

  await ensureDefaultNichesForSource(source);

  const paths = form.getAll("nichePath").map(String);
  const keywords = form.getAll("nicheKeywords").map((v) => String(v).trim());
  const maxItemsList = form.getAll("nicheMaxItems").map((v) => Number(v));
  const priorities = form.getAll("nichePriority").map((v) => Number(v));
  const enabledSet = new Set(form.getAll("nicheEnabled").map(String));

  await prisma.$transaction(async (tx) => {
    await tx.automationNiche.deleteMany({ where: { source } });

    for (let i = 0; i < paths.length; i += 1) {
      const categoryPath = paths[i];
      const kw = keywords[i] || categoryPath.split("/").pop()?.replace(/-/g, " ") || categoryPath;

      await tx.automationNiche.create({
        data: {
          source,
          categoryPath,
          keywords: kw,
          maxItems: Math.max(1, Math.min(10, Number.isFinite(maxItemsList[i]) ? maxItemsList[i] : 8)),
          priority: Math.max(1, Math.min(9999, Number.isFinite(priorities[i]) ? priorities[i] : i + 1)),
          isEnabled: enabledSet.has(categoryPath),
        },
      });
    }
  });

  return NextResponse.redirect(new URL("/admin/automation", request.url), 302);
}

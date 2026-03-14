import { NextRequest, NextResponse } from "next/server";
import { isAdminSession } from "@/lib/admin";
import { ensureDefaultNichesForSource } from "@/lib/automation-niches";
import type { OfferSource } from "@/lib/offer-source";
import { prisma } from "@/lib/prisma";

const SOURCES: OfferSource[] = ["AMAZON", "ALIEXPRESS", "TEMU", "ALIBABA", "EBAY"];

export async function POST(request: NextRequest) {
  if (!(await isAdminSession())) {
    return NextResponse.redirect(new URL("/admin/login", request.url), 302);
  }

  try {
    const form = await request.formData();
    const sourceRaw = String(form.get("source") || "AMAZON").toUpperCase();
    const source = SOURCES.includes(sourceRaw as OfferSource) ? (sourceRaw as OfferSource) : "AMAZON";

    const maxPostsPerRun = Math.max(1, Math.min(200, Number(form.get("maxPostsPerRun") || 5) || 5));
    const minPriceRaw = String(form.get("minPriceUsd") || "").trim();
    const minPriceNum = minPriceRaw ? Number(minPriceRaw) : null;

    const existing = await prisma.automationConfig.findFirst({ orderBy: { updatedAt: "desc" }, select: { id: true } });

    const data = {
      isEnabled: form.get("isEnabled") === "on",
      autoPostEnabled: form.get("autoPostEnabled") === "on",
      aiRewriteEnabled: form.get("aiRewriteEnabled") === "on",
      source,
      publishMode: String(form.get("publishMode") || "DRAFT").toUpperCase() === "PUBLISHED" ? "PUBLISHED" : "DRAFT",
      maxPostsPerRun,
      minPriceUsd: Number.isFinite(minPriceNum as number) ? minPriceNum : null,
      promptTemplate: String(form.get("promptTemplate") || "").trim() || null,
    };

    if (existing?.id) {
      await prisma.automationConfig.update({ where: { id: existing.id }, data });
    } else {
      await prisma.automationConfig.create({ data });
    }

    await ensureDefaultNichesForSource(source);

    const paths = form.getAll("nichePath").map((v) => String(v).trim()).filter(Boolean);
    const keywords = form.getAll("nicheKeywords").map((v) => String(v).trim());
    const maxItemsList = form.getAll("nicheMaxItems").map((v) => Number(v));
    const priorities = form.getAll("nichePriority").map((v) => Number(v));
    const enabledSet = new Set(form.getAll("nicheEnabled").map((v) => String(v).trim()));

    const seen = new Set<string>();
    const rows: Array<{
      categoryPath: string;
      keywords: string;
      maxItems: number;
      priority: number;
      isEnabled: boolean;
    }> = [];

    for (let i = 0; i < paths.length; i += 1) {
      const categoryPath = paths[i];
      if (!categoryPath || seen.has(categoryPath)) continue;
      seen.add(categoryPath);
      const kw = keywords[i] || categoryPath.split("/").pop()?.replace(/-/g, " ") || categoryPath;
      rows.push({
        categoryPath,
        keywords: kw,
        maxItems: Math.max(1, Math.min(10, Number.isFinite(maxItemsList[i]) ? maxItemsList[i] : 8)),
        priority: Math.max(1, Math.min(9999, Number.isFinite(priorities[i]) ? priorities[i] : i + 1)),
        isEnabled: enabledSet.has(categoryPath),
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.automationNiche.deleteMany({ where: { source } });
      if (rows.length > 0) {
        await tx.automationNiche.createMany({
          data: rows.map((r) => ({ source, ...r })),
        });
      }
    });

    return NextResponse.redirect(new URL("/admin/automation?saved=1", request.url), 302);
  } catch (error) {
    console.error("automation save failed", error);
    return NextResponse.redirect(new URL("/admin/automation?saveError=1", request.url), 302);
  }
}

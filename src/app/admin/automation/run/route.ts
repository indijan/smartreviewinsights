import { NextRequest, NextResponse } from "next/server";
import { isAdminSession } from "@/lib/admin";
import { runCleanAmazonPipeline } from "@/lib/offers/clean-amazon-pipeline";
import { discoverAmazonOffers } from "@/lib/offers/amazon-discovery";
import { generateOfferLandingPagesForSource } from "@/lib/offers/auto-pages";
import { syncAmazonOffers } from "@/lib/offers/amazon-sync";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  if (!(await isAdminSession())) {
    return NextResponse.redirect(new URL("/admin/login", request.url), 302);
  }

  const config = await prisma.automationConfig.findFirst({ orderBy: { updatedAt: "desc" } });
  const source = config?.source ?? "AMAZON";

  const form = await request.formData();
  const forceFull = String(form.get("forceFull") || "").toLowerCase() === "1";
  const staleHoursRaw = Number(form.get("staleHours") || 24);
  const staleHours = Number.isFinite(staleHoursRaw) ? Math.max(0, Math.min(24 * 90, staleHoursRaw)) : 24;

  const run = await prisma.automationRun.create({
    data: {
      source,
      status: "QUEUED",
      itemsSeen: 0,
      itemsPosted: 0,
      message: "Manual trigger started.",
    },
  });

  try {
    const apiEnabled = process.env.AMAZON_API_ENABLED === "1";
    const shouldAutoPost = config?.autoPostEnabled ?? false;
    const publishMode = (config?.publishMode === "PUBLISHED" ? "PUBLISHED" : "DRAFT") as "DRAFT" | "PUBLISHED";

    if (source === "AMAZON" && apiEnabled) {
      const minPrice = config?.minPriceUsd != null ? Number(config.minPriceUsd) : null;

      const discovery = await discoverAmazonOffers({
        limit: config?.maxPostsPerRun ?? 50,
        minPriceUsd: Number.isFinite(minPrice) ? minPrice : null,
      });

      const sync = await syncAmazonOffers({
        limit: config?.maxPostsPerRun ?? 50,
        onlyOutdatedHours: forceFull ? 0 : staleHours,
      });

      const posted =
        discovery.ingest.createdOffers +
        discovery.ingest.updatedOffers +
        sync.ingest.createdOffers +
        sync.ingest.updatedOffers;

      await prisma.automationRun.update({
        where: { id: run.id },
        data: {
          status: "SUCCESS",
          itemsSeen: discovery.itemsFetched + sync.requestedAsins,
          itemsPosted: posted,
          message:
            `API mode used. Discovery niches=${discovery.nichesUsed}, fetched=${discovery.itemsFetched}, ` +
            `created=${discovery.ingest.createdOffers}, updated=${discovery.ingest.updatedOffers}. ` +
            `Sync requested=${sync.requestedAsins}, fetched=${sync.fetchedItems}, priceUpdates=${sync.ingest.priceUpdates}.`,
          finishedAt: new Date(),
        },
      });

      if (shouldAutoPost) {
        const pages = await generateOfferLandingPagesForSource({
          source,
          publishMode,
          maxPages: config?.maxPostsPerRun ?? 20,
        });
        await prisma.automationRun.update({
          where: { id: run.id },
          data: {
            message:
              `API mode used. Discovery niches=${discovery.nichesUsed}, fetched=${discovery.itemsFetched}, ` +
              `created=${discovery.ingest.createdOffers}, updated=${discovery.ingest.updatedOffers}. ` +
              `Sync requested=${sync.requestedAsins}, fetched=${sync.fetchedItems}, priceUpdates=${sync.ingest.priceUpdates}. ` +
              `Auto pages processed=${pages.processed}, created=${pages.created}, updated=${pages.updated}.`,
          },
        });
      }

      return NextResponse.redirect(new URL("/admin/automation", request.url), 302);
    }

    const runnerConfig = config ?? {
      id: "default",
      isEnabled: true,
      autoPostEnabled: true,
      aiRewriteEnabled: false,
      source,
      publishMode,
      maxPostsPerRun: 5,
      minPriceUsd: null,
      promptTemplate: null,
      updatedAt: new Date(),
      createdAt: new Date(),
    };

    await prisma.automationRun.update({
      where: { id: run.id },
      data: {
        message: "Clean pipeline running: Amazon search scrape -> product scrape -> AI rewrite -> single offer -> publish.",
      },
    });

    const result = await runCleanAmazonPipeline(runnerConfig, { runId: run.id });

    const postedPages = result.createdPages + result.updatedPages;
    const failedByAi = result.aiAttempts === 0 || result.aiFailures > 0;
    const noPages = postedPages === 0;
    await prisma.automationRun.update({
      where: { id: run.id },
      data: {
        status: noPages || failedByAi ? "FAILED" : "SUCCESS",
        itemsSeen: result.requestedPosts,
        itemsPosted: postedPages,
        message:
          (noPages || failedByAi
            ? "Run failed quality gate. "
            : "") +
          `Clean pipeline complete for ${source}. niches=${result.nichesUsed}, requestedPosts=${result.requestedPosts}, ` +
          `pagesCreated=${result.createdPages}, pagesUpdated=${result.updatedPages}, ` +
          `offersGenerated=${result.generatedOffers}, offerCreated=${result.createdOffers}, offerUpdated=${result.updatedOffers}, ` +
          `skippedNoValidAmazon=${result.skippedNoValidAmazon}, aiAttempts=${result.aiAttempts}, aiFailures=${result.aiFailures}.`,
        finishedAt: new Date(),
      },
    });

    return NextResponse.redirect(new URL("/admin/automation", request.url), 302);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Automation run failed";
    await prisma.automationRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        message,
        finishedAt: new Date(),
      },
    });
  }

  return NextResponse.redirect(new URL("/admin/automation", request.url), 302);
}

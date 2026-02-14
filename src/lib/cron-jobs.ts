import { runCleanAmazonPipeline, backcheckPublishedAmazonPrices } from "@/lib/offers/clean-amazon-pipeline";
import { getWeightedAmazonNiches, pickWeightedUniqueCategoryPaths } from "@/lib/automation-scheduler";
import { prisma } from "@/lib/prisma";

export async function runAutopostCronJob() {
  const config = await prisma.automationConfig.findFirst({ orderBy: { updatedAt: "desc" } });
  if (!config || !config.isEnabled || !config.autoPostEnabled || config.source !== "AMAZON") {
    return { ok: true as const, skipped: true as const, reason: "automation disabled or wrong source" };
  }

  const weighted = await getWeightedAmazonNiches(30);
  if (weighted.length === 0) {
    return { ok: true as const, skipped: true as const, reason: "no enabled niches" };
  }

  const run = await prisma.automationRun.create({
    data: {
      source: "AMAZON",
      status: "QUEUED",
      itemsSeen: 0,
      itemsPosted: 0,
      message: "Cron autopost started.",
    },
  });

  try {
    const candidates = pickWeightedUniqueCategoryPaths(weighted, Math.min(3, weighted.length));
    let winner: string | null = null;
    let finalResult: Awaited<ReturnType<typeof runCleanAmazonPipeline>> | null = null;

    for (const categoryPath of candidates) {
      const result = await runCleanAmazonPipeline(config, {
        runId: run.id,
        targetCategoryPaths: [categoryPath],
        forceMaxItemsPerNiche: 1,
        maxTotalPosts: 1,
      });
      if ((result.createdPages + result.updatedPages) > 0) {
        winner = categoryPath;
        finalResult = result;
        break;
      }
    }

    const selected = winner || candidates[0] || null;
    const result = finalResult || {
      nichesUsed: 0,
      requestedPosts: 0,
      createdPages: 0,
      updatedPages: 0,
      generatedOffers: 0,
      createdOffers: 0,
      updatedOffers: 0,
      skippedNoValidAmazon: 0,
      aiAttempts: 0,
      aiFailures: 0,
    };
    const posted = result.createdPages + result.updatedPages;

    await prisma.automationRun.update({
      where: { id: run.id },
      data: {
        status: posted > 0 ? "SUCCESS" : "FAILED",
        itemsSeen: result.requestedPosts,
        itemsPosted: posted,
        message:
          `Cron autopost done. target=${selected ?? "none"}, candidates=${candidates.join(", ")}, ` +
          `pagesCreated=${result.createdPages}, pagesUpdated=${result.updatedPages}, aiAttempts=${result.aiAttempts}, aiFailures=${result.aiFailures}.`,
        finishedAt: new Date(),
      },
    });

    return { ok: true as const, runId: run.id, selected, candidates, posted };
  } catch (error) {
    await prisma.automationRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        message: error instanceof Error ? error.message : "cron autopost failed",
        finishedAt: new Date(),
      },
    });
    return { ok: false as const, runId: run.id };
  }
}

export async function runMonthlyPriceBackcheckCronJob() {
  const run = await prisma.automationRun.create({
    data: {
      source: "AMAZON",
      status: "QUEUED",
      itemsSeen: 0,
      itemsPosted: 0,
      message: "Monthly price backcheck started.",
    },
  });

  try {
    const result = await backcheckPublishedAmazonPrices({ runId: run.id, limit: 1000 });
    await prisma.automationRun.update({
      where: { id: run.id },
      data: {
        status: "SUCCESS",
        itemsSeen: result.scanned,
        itemsPosted: result.updatedOffers,
        message: `Monthly price backcheck complete. scanned=${result.scanned}, updatedOffers=${result.updatedOffers}, priceUpdates=${result.priceUpdates}.`,
        finishedAt: new Date(),
      },
    });
    return { ok: true as const, runId: run.id, ...result };
  } catch (error) {
    await prisma.automationRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        message: error instanceof Error ? error.message : "monthly backcheck failed",
        finishedAt: new Date(),
      },
    });
    return { ok: false as const, runId: run.id };
  }
}

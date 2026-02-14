import { prisma } from "@/lib/prisma";
import { runCleanAmazonPipeline } from "@/lib/offers/clean-amazon-pipeline";

async function main() {
  const config = await prisma.automationConfig.findFirst({ orderBy: { updatedAt: "desc" } });
  const source = config?.source ?? "AMAZON";
  const publishMode = (config?.publishMode === "PUBLISHED" ? "PUBLISHED" : "DRAFT") as "DRAFT" | "PUBLISHED";
  const runnerConfig = config ?? {
    id: "quality-gate-temp",
    isEnabled: true,
    autoPostEnabled: true,
    aiRewriteEnabled: true,
    source,
    publishMode,
    maxPostsPerRun: 1,
    minPriceUsd: null,
    promptTemplate: null,
    updatedAt: new Date(),
    createdAt: new Date(),
  };

  const summary: Array<Record<string, unknown>> = [];

  for (let i = 1; i <= 5; i += 1) {
    const run = await prisma.automationRun.create({
      data: {
        source,
        status: "QUEUED",
        itemsSeen: 0,
        itemsPosted: 0,
        message: `Quality gate run ${i}/5 started`,
      },
      select: { id: true },
    });

    const started = Date.now();
    try {
      const result = await runCleanAmazonPipeline(runnerConfig as never, { runId: run.id });
      const postedPages = result.createdPages + result.updatedPages;
      const pass = postedPages > 0 && result.aiAttempts > 0 && result.aiFailures === 0;
      await prisma.automationRun.update({
        where: { id: run.id },
        data: {
          status: pass ? "SUCCESS" : "FAILED",
          itemsSeen: result.requestedPosts,
          itemsPosted: postedPages,
          message: `Quality gate ${i}/5: posted=${postedPages}, aiAttempts=${result.aiAttempts}, aiFailures=${result.aiFailures}, skippedNoValidAmazon=${result.skippedNoValidAmazon}`,
          finishedAt: new Date(),
        },
      });
      summary.push({
        runIndex: i,
        runId: run.id,
        pass,
        durationSec: Math.round((Date.now() - started) / 1000),
        postedPages,
        aiAttempts: result.aiAttempts,
        aiFailures: result.aiFailures,
        skippedNoValidAmazon: result.skippedNoValidAmazon,
        nichesUsed: result.nichesUsed,
        requestedPosts: result.requestedPosts,
      });
    } catch (error) {
      await prisma.automationRun.update({
        where: { id: run.id },
        data: {
          status: "FAILED",
          message: error instanceof Error ? error.message : String(error),
          finishedAt: new Date(),
        },
      });
      summary.push({
        runIndex: i,
        runId: run.id,
        pass: false,
        durationSec: Math.round((Date.now() - started) / 1000),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const passed = summary.filter((x) => x.pass === true).length;
  console.log(JSON.stringify({ passed, total: 5, summary }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


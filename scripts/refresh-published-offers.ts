import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { refreshPublishedOffersDaily } from "../src/lib/offers/production-safe-amazon-pipeline";

async function main() {
  const run = await prisma.automationRun.create({
    data: {
      source: "AMAZON",
      status: "QUEUED",
      message: "Daily published-offers refresh started.",
    },
  });

  try {
    await refreshPublishedOffersDaily({ runId: run.id, limit: 100 });
    await prisma.automationRun.update({
      where: { id: run.id },
      data: {
        status: "SUCCESS",
        message: "Daily refresh completed.",
        finishedAt: new Date(),
      },
    });
  } catch (error) {
    await prisma.automationRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        message: error instanceof Error ? error.message : "Daily refresh failed",
        finishedAt: new Date(),
      },
    });
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

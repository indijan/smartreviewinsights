import "dotenv/config";
import { ensureDefaultNichesForSource } from "../src/lib/automation-niches";
import { prisma } from "../src/lib/prisma";

async function main() {
  await ensureDefaultNichesForSource("AMAZON");
  const count = await prisma.automationNiche.count({ where: { source: "AMAZON" } });
  console.log({ amazonNiches: count });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

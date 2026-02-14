import { prisma } from "@/lib/prisma";

async function main() {
  const pages = await prisma.page.findMany({
    where: { type: "REVIEW" },
    select: { id: true, contentMd: true },
  });

  let updated = 0;
  for (const p of pages) {
    const current = (p.contentMd || "").trim();
    const next = current
      .replace(/\n?##\s*Disclaimer\s*\n+This page may include affiliate links\.\s*\n?/gi, "\n")
      .replace(/\n?This page may include affiliate links\.\s*\n?/gi, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    if (next !== current) {
      await prisma.page.update({ where: { id: p.id }, data: { contentMd: next } });
      updated += 1;
    }
  }

  console.log(JSON.stringify({ total: pages.length, updated }, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

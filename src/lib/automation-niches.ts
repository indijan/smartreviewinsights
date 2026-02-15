import { categoryAutomationNodes } from "@/lib/category-taxonomy";
import type { OfferSource } from "@/lib/offer-source";
import { prisma } from "@/lib/prisma";

function labelToKeyword(path: string) {
  return path
    .split("/")
    .pop()
    ?.replace(/-/g, " ")
    .trim();
}

export async function ensureDefaultNichesForSource(source: OfferSource) {
  const count = await prisma.automationNiche.count({ where: { source } });
  if (count > 0) return;

  const nodes = categoryAutomationNodes();
  for (const [index, node] of nodes.entries()) {
    const keyword = labelToKeyword(node.path);
    if (!keyword) continue;

    await prisma.automationNiche.create({
      data: {
        source,
        categoryPath: node.path,
        keywords: keyword,
        priority: index + 1,
        maxItems: 8,
        isEnabled: true,
      },
    });
  }
}

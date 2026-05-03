import { prisma } from "@/lib/prisma";
import { normalizeSlugValue } from "@/lib/traffic-lab";

type RiskMode = "safe" | "balanced" | "aggressive";
type MonetizationMode = "display_ads" | "display_plus_outbound";

type GeneratedPlan = {
  cluster: string;
  fitReason: string;
  hook: string;
  entryTitle: string;
  bridgeTitle: string;
  exitTitle: string;
  entrySummary: string;
  bridgeSummary: string;
  exitSummary: string;
  ctaLabel: string;
};

export const TRAFFIC_TEST_PRESETS = [
  {
    label: "Sleep Confusion",
    prompt: "Find a SmartReviewInsights-adjacent cheap-click topic around sleep confusion, tired mornings, and simple comfort mistakes that can pull low-cost curiosity traffic in the US and push it toward a click exit.",
  },
  {
    label: "Home Comfort",
    prompt: "Find a SmartReviewInsights-adjacent cheap-click topic around home comfort mistakes, cold rooms, and hidden household friction where cheap traffic can be turned into a short click-out path.",
  },
  {
    label: "Dog Problems",
    prompt: "Find a SmartReviewInsights-adjacent cheap-click topic around dog owner mistakes, pet comfort confusion, and curiosity-led problem pages that can attract cheap traffic and route users toward a click exit.",
  },
  {
    label: "Car Tech Mistakes",
    prompt: "Find a SmartReviewInsights-adjacent cheap-click topic around car electronics mistakes, everyday driver confusion, and low-CPC practical curiosity that can convert into outbound clicks.",
  },
  {
    label: "Gadget Regret",
    prompt: "Find a SmartReviewInsights-adjacent cheap-click topic around people buying gadgets too early, choosing the wrong device, or misunderstanding features, with a clear exit-click path.",
  },
] as const;

function parseJsonObject(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function callOpenAiJson(prompt: string): Promise<Record<string, unknown> | null> {
  if (!process.env.OPENAI_API_KEY) return null;
  const resp = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      input: prompt,
      temperature: 0.5,
    }),
  });
  if (!resp.ok) return null;
  const data = (await resp.json()) as Record<string, unknown>;
  const parsed = parseJsonObject(String(data.output_text || ""));
  return parsed;
}

function fallbackPlan(prompt: string): GeneratedPlan {
  const base = prompt.trim().replace(/\.$/, "");
  const cluster = normalizeSlugValue(base.split(/\s+/).slice(0, 3).join(" ")) || "attention-tests";
  return {
    cluster,
    fitReason: "This topic stays close to consumer decision, review, and comparison intent while still being broad enough for cheaper curiosity-driven traffic.",
    hook: base,
    entryTitle: `Why ${base} Costs People More Than They Expect`,
    bridgeTitle: `${base}: What People Miss Before They Click Away`,
    exitTitle: `See The Next Recommended ${base} Options`,
    entrySummary: `Entry page built to capture cheap attention around ${base} with a problem-first hook and internal next-step links.`,
    bridgeSummary: `Bridge page designed to stretch attention, deepen session depth, and warm the visitor for the final click.`,
    exitSummary: `Exit page built to convert retained attention into a clear outbound click without overcomplicating the choice.`,
    ctaLabel: "See Recommended Options",
  };
}

export async function generateTrafficTestPlan(args: {
  prompt: string;
  geo: string;
  budgetUsd: number;
  riskMode: RiskMode;
  monetizationMode: MonetizationMode;
}) {
  const fallback = fallbackPlan(args.prompt);
  const ai = await callOpenAiJson(
    [
      "You design domain-fit traffic arbitrage tests for SmartReviewInsights.com.",
      "The site is about consumer decisions, reviews, comparisons, gadgets, home comfort, pets, sleep, lifestyle, and practical buying guidance.",
      "Return strict JSON only.",
      'Schema: {"cluster":"...","fitReason":"...","hook":"...","entryTitle":"...","bridgeTitle":"...","exitTitle":"...","entrySummary":"...","bridgeSummary":"...","exitSummary":"...","ctaLabel":"..."}',
      "Keep topics close enough to the existing site brand to feel plausible.",
      "Prefer cheap-click curiosity or mistake-avoidance angles that could work with ClickBoom style traffic.",
      "The output must support a 3-page flow: entry -> bridge -> exit.",
      `User prompt: ${args.prompt}`,
      `Geo: ${args.geo}`,
      `Daily test budget: ${args.budgetUsd} USD`,
      `Risk mode: ${args.riskMode}`,
      `Monetization mode: ${args.monetizationMode}`,
    ].join("\n"),
  );

  return {
    cluster: String(ai?.cluster || fallback.cluster),
    fitReason: String(ai?.fitReason || fallback.fitReason),
    hook: String(ai?.hook || fallback.hook),
    entryTitle: String(ai?.entryTitle || fallback.entryTitle),
    bridgeTitle: String(ai?.bridgeTitle || fallback.bridgeTitle),
    exitTitle: String(ai?.exitTitle || fallback.exitTitle),
    entrySummary: String(ai?.entrySummary || fallback.entrySummary),
    bridgeSummary: String(ai?.bridgeSummary || fallback.bridgeSummary),
    exitSummary: String(ai?.exitSummary || fallback.exitSummary),
    ctaLabel: String(ai?.ctaLabel || fallback.ctaLabel),
  } satisfies GeneratedPlan;
}

async function uniqueSlug(base: string) {
  let candidate = base;
  let i = 2;
  while (true) {
    const existing = await prisma.page.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!existing) return candidate;
    candidate = `${base}-${i}`;
    i += 1;
  }
}

export async function createTrafficTestDrafts(args: {
  prompt: string;
  geo: string;
  budgetUsd: number;
  riskMode: RiskMode;
  monetizationMode: MonetizationMode;
  outboundUrl?: string | null;
  publish?: boolean;
}) {
  const plan = await generateTrafficTestPlan(args);
  const clusterSlug = normalizeSlugValue(plan.cluster);
  const hookSlug = normalizeSlugValue(plan.hook);

  const entrySlug = await uniqueSlug(`insights/${clusterSlug}/${hookSlug}`);
  const bridgeSlug = await uniqueSlug(`guides/${clusterSlug}/${hookSlug}`);
  const exitSlug = await uniqueSlug(`next/${clusterSlug}/${hookSlug}`);

  let trafficOfferId: string | null = null;
  let trafficOfferSlug: string | null = null;
  if (args.outboundUrl?.trim()) {
    const offer = await prisma.trafficOffer.create({
      data: {
        name: plan.exitTitle,
        slug: await uniqueSlug(`exit-${clusterSlug}-${hookSlug}`),
        offerType: "outbound_click",
        destinationUrl: args.outboundUrl.trim(),
        network: "generic_exit",
        commissionType: "cpc",
        status: "active",
        disclosureRequired: false,
        notes: `Auto-created outbound click target for prompt: ${args.prompt}`,
      },
      select: { id: true, slug: true },
    });
    trafficOfferId = offer.id;
    trafficOfferSlug = offer.slug;
  }

  const exitHref = trafficOfferSlug
    ? `/go/${trafficOfferSlug}?page=${encodeURIComponent(exitSlug)}&p=exit-primary`
    : "/";

  const entryContent = [
    `# ${plan.entryTitle}`,
    "",
    plan.entrySummary,
    "",
    `This test is aimed at **${args.geo}** traffic and is designed to validate whether cheap attention around **${plan.hook}** can be stretched into a profitable click path on SmartReviewInsights.`,
    "",
    "## Why this topic fits SmartReviewInsights",
    "",
    plan.fitReason,
    "",
    "## What usually goes wrong",
    "",
    "- People click into this topic with broad curiosity but weak buying clarity.",
    "- Most pages answer the surface question and lose the visitor too quickly.",
    "- The opportunity is to keep the visitor moving toward a clearer next step.",
    "",
    "## Continue the path",
    "",
    `- [Read the deeper guide](/${bridgeSlug})`,
    `- [Skip to the next-step options](/${exitSlug})`,
  ].join("\n");

  const bridgeContent = [
    `# ${plan.bridgeTitle}`,
    "",
    plan.bridgeSummary,
    "",
    "## What to check before you decide",
    "",
    "- Clarify the underlying problem, not just the visible symptom.",
    "- Compare the likely outcomes, not only the labels.",
    "- Avoid the default option if the context is still fuzzy.",
    "",
    "## Practical decision grid",
    "",
    "| Situation | Best next move |",
    "| --- | --- |",
    "| You are still just curious | Read one more practical explanation |",
    "| You think you know the issue | Compare the next-step options |",
    "| You want the fastest route | Go straight to the action page |",
    "",
    `- [Return to the entry page](/${entrySlug})`,
    `- [Open the action page](/${exitSlug})`,
  ].join("\n");

  const exitContent = [
    `# ${plan.exitTitle}`,
    "",
    plan.exitSummary,
    "",
    "## Fastest next step",
    "",
    "This page is intentionally short. Its job is to turn retained attention into a clean next click.",
    "",
    "## Recommended action",
    "",
    args.outboundUrl?.trim()
      ? `[${plan.ctaLabel}](${exitHref})`
      : "Add an outbound URL later if you want this page to push visitors off-site.",
    "",
    `- [Need more context first? Go back to the guide.](/${bridgeSlug})`,
    `- [Need the original hook again? Return to the entry page.](/${entrySlug})`,
  ].join("\n");

  const [entryPage, bridgePage, exitPage] = await Promise.all([
    prisma.page.create({
      data: {
        slug: entrySlug,
        type: "ARTICLE",
        title: plan.entryTitle,
        excerpt: plan.entrySummary,
        contentMd: entryContent,
        status: args.publish ? "PUBLISHED" : "DRAFT",
        publishedAt: args.publish ? new Date() : null,
      },
      select: { id: true, slug: true, title: true },
    }),
    prisma.page.create({
      data: {
        slug: bridgeSlug,
        type: "ARTICLE",
        title: plan.bridgeTitle,
        excerpt: plan.bridgeSummary,
        contentMd: bridgeContent,
        status: args.publish ? "PUBLISHED" : "DRAFT",
        publishedAt: args.publish ? new Date() : null,
      },
      select: { id: true, slug: true, title: true },
    }),
    prisma.page.create({
      data: {
        slug: exitSlug,
        type: "LANDING",
        title: plan.exitTitle,
        excerpt: plan.exitSummary,
        contentMd: exitContent,
        status: args.publish ? "PUBLISHED" : "DRAFT",
        publishedAt: args.publish ? new Date() : null,
      },
      select: { id: true, slug: true, title: true },
    }),
  ]);

  return {
    plan,
    pages: [entryPage, bridgePage, exitPage],
    trafficOfferId,
  };
}

export function trafficPresentationForSlug(slug: string) {
  if (slug.startsWith("insights/")) {
    return {
      stage: "Entry Page",
      eyebrow: "Cheap Attention Capture",
      blurb: "Problem-first hook built to earn the first low-cost click and push visitors deeper into the path.",
    };
  }
  if (slug.startsWith("guides/")) {
    return {
      stage: "Bridge Page",
      eyebrow: "Attention Stretch",
      blurb: "Retention-focused page designed to lengthen session depth before the exit click.",
    };
  }
  if (slug.startsWith("next/")) {
    return {
      stage: "Exit Page",
      eyebrow: "Click Exit",
      blurb: "Short decision page built to convert warmed attention into a clean outbound click.",
    };
  }
  return null;
}

export function isTrafficExitSlug(slug: string) {
  return slug.startsWith("next/");
}

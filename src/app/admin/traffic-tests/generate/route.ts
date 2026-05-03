import { NextRequest, NextResponse } from "next/server";
import { isAdminSession } from "@/lib/admin";
import { createTrafficTestDrafts } from "@/lib/traffic-tests";

export async function POST(request: NextRequest) {
  if (!(await isAdminSession())) {
    return NextResponse.redirect(new URL("/admin/login", request.url), 302);
  }

  const form = await request.formData();
  const prompt = String(form.get("prompt") || "").trim();
  const geo = String(form.get("geo") || "US").trim() || "US";
  const budgetUsd = Math.max(5, Number(form.get("budgetUsd") || 20));
  const riskMode = String(form.get("riskMode") || "balanced") as "safe" | "balanced" | "aggressive";
  const monetizationMode = String(form.get("monetizationMode") || "display_plus_outbound") as "display_ads" | "display_plus_outbound";
  const outboundUrl = String(form.get("outboundUrl") || "").trim() || null;
  const publish = String(form.get("publishNow") || "") === "1";

  if (!prompt) {
    return NextResponse.redirect(new URL("/admin/traffic-tests?error=missing-prompt", request.url), 302);
  }

  const result = await createTrafficTestDrafts({
    prompt,
    geo,
    budgetUsd,
    riskMode,
    monetizationMode,
    outboundUrl,
    publish,
  });

  return NextResponse.redirect(
    new URL(
      `/admin/traffic-tests/result?ids=${encodeURIComponent(result.pages.map((page) => page.id).join(","))}&hook=${encodeURIComponent(result.plan.hook)}&cluster=${encodeURIComponent(result.plan.cluster)}&mode=${publish ? "published" : "draft"}`,
      request.url,
    ),
    302,
  );
}

import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { normalizeSlug } from "@/lib/slug";

const BOT_USER_AGENT_PATTERN =
  /bot|crawler|spider|curl|wget|headless|preview|facebookexternalhit|slurp|bingpreview|httpclient/i;

export function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() ?? "";
  }
  return request.headers.get("x-real-ip") ?? "";
}

export function hashIp(ip: string): string | null {
  if (!ip) return null;
  return createHash("sha256").update(ip).digest("hex");
}

export function isLikelyBotRequest(request: NextRequest): boolean {
  const purpose = request.headers.get("purpose") ?? request.headers.get("x-purpose") ?? "";
  if (purpose.toLowerCase().includes("prefetch")) return true;

  const nextRouterPrefetch = request.headers.get("next-router-prefetch");
  if (nextRouterPrefetch) return true;

  const userAgent = request.headers.get("user-agent") ?? "";
  if (!userAgent) return true;

  return BOT_USER_AGENT_PATTERN.test(userAgent);
}

export function getClickBucketDay(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function buildClickBucketKey(args: {
  day: string;
  source: string;
  pageId?: string | null;
  offerId?: string | null;
}): string {
  return [args.day, args.source, args.pageId ?? "-", args.offerId ?? "-"].join(":");
}

export function getDeviceType(userAgent: string) {
  const ua = String(userAgent || "").toLowerCase();
  if (/tablet|ipad/.test(ua)) return "tablet";
  if (/mobile|iphone|android/.test(ua)) return "mobile";
  return "desktop";
}

export function getOrCreateSessionId(request: NextRequest) {
  const existing = request.cookies.get("sri_sid")?.value;
  return existing || randomUUID();
}

export function normalizeOptionalSlug(input: string | null | undefined) {
  const value = normalizeSlug(input ?? "");
  return value || "";
}

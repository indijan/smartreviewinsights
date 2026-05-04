import crypto from "node:crypto";
import { cookies } from "next/headers";
import { google } from "googleapis";

type SearchConsoleStatePayload = {
  exp: number;
  returnTo?: string | null;
};

type SearchConsoleCookiePayload = {
  access_token?: string | null;
  refresh_token?: string | null;
  expiry_date?: number | null;
  scope?: string | null;
  token_type?: string | null;
};

export type SearchConsoleSite = {
  siteUrl: string;
  permissionLevel: string;
};

export type SearchConsoleRow = {
  key: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type SearchConsoleAudit = {
  sites: SearchConsoleSite[];
  selectedSite: string | null;
  topPages: SearchConsoleRow[];
  topQueries: SearchConsoleRow[];
};

export type SearchConsolePageInsight = {
  siteUrl: string | null;
  pageUrl: string;
  page: SearchConsoleRow | null;
  topQueries: SearchConsoleRow[];
};

export type SearchConsolePageMetric = {
  pageUrl: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type SearchConsolePageQueryMetric = {
  pageUrl: string;
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

const SEARCH_CONSOLE_COOKIE = "sri_search_console_auth";
const SEARCH_CONSOLE_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const DEFAULT_SITE_URLS = ["sc-domain:smartreviewinsights.com", "https://smartreviewinsights.com/"];

function normalizeReturnTo(value?: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("/")) return null;
  if (trimmed.startsWith("//")) return null;
  return trimmed;
}

function getSecret() {
  return process.env.PROVIDER_ACCESS_SECRET ?? process.env.CRON_SECRET ?? null;
}

function getKey() {
  const secret = getSecret();
  if (!secret) {
    throw new Error("Missing PROVIDER_ACCESS_SECRET or CRON_SECRET env for Search Console auth.");
  }
  return crypto.createHash("sha256").update(secret).digest();
}

function getBaseSiteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://smartreviewinsights.com").replace(/\/$/, "");
}

function getRedirectUri() {
  return `${getBaseSiteUrl()}/api/search-console/callback`;
}

function getOAuthClient() {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    throw new Error("Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET env for Search Console.");
  }

  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    getRedirectUri(),
  );
}

function encodeState(input: SearchConsoleStatePayload) {
  const secret = getSecret();
  if (!secret) throw new Error("Missing PROVIDER_ACCESS_SECRET or CRON_SECRET env.");
  const body = Buffer.from(JSON.stringify(input), "utf8").toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

function decodeState(input: string): SearchConsoleStatePayload | null {
  const secret = getSecret();
  if (!secret) return null;
  const [body, signature] = input.split(".");
  if (!body || !signature) return null;
  const expected = crypto.createHmac("sha256", secret).update(body).digest("base64url");

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SearchConsoleStatePayload;
    if (!parsed.exp || parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

function encryptPayload(payload: SearchConsoleCookiePayload) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

function decryptPayload(input: string): SearchConsoleCookiePayload | null {
  const [ivPart, tagPart, cipherPart] = input.split(".");
  if (!ivPart || !tagPart || !cipherPart) return null;

  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivPart, "base64url"));
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(cipherPart, "base64url")),
      decipher.final(),
    ]).toString("utf8");

    return JSON.parse(plaintext) as SearchConsoleCookiePayload;
  } catch {
    return null;
  }
}

export function createSearchConsoleConnectUrl(returnTo?: string | null) {
  const client = getOAuthClient();
  const state = encodeState({
    exp: Date.now() + 1000 * 60 * 20,
    returnTo: normalizeReturnTo(returnTo),
  });

  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: true,
    scope: [SEARCH_CONSOLE_SCOPE],
    state,
  });
}

export async function completeSearchConsoleConnection(code: string, state: string) {
  const payload = decodeState(state);
  if (!payload) throw new Error("Invalid Search Console state.");

  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);
  const cookieStore = await cookies();
  cookieStore.set(
    SEARCH_CONSOLE_COOKIE,
    encryptPayload({
      access_token: tokens.access_token ?? null,
      refresh_token: tokens.refresh_token ?? null,
      expiry_date: tokens.expiry_date ?? null,
      scope: tokens.scope ?? null,
      token_type: tokens.token_type ?? null,
    }),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: getRedirectUri().startsWith("https://"),
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    },
  );

  return {
    returnTo: normalizeReturnTo(payload.returnTo) ?? "/admin/opportunities",
  };
}

export async function clearSearchConsoleSession() {
  const cookieStore = await cookies();
  cookieStore.set(SEARCH_CONSOLE_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: getRedirectUri().startsWith("https://"),
    path: "/",
    maxAge: 0,
  });
}

async function getAuthorizedClient() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SEARCH_CONSOLE_COOKIE)?.value;
  if (!raw) return null;

  const payload = decryptPayload(raw);
  if (!payload?.access_token && !payload?.refresh_token) return null;

  const client = getOAuthClient();
  client.setCredentials({
    access_token: payload.access_token ?? undefined,
    refresh_token: payload.refresh_token ?? undefined,
    expiry_date: payload.expiry_date ?? undefined,
    scope: payload.scope ?? undefined,
    token_type: payload.token_type ?? undefined,
  });

  return client;
}

export async function hasSearchConsoleConnection() {
  return Boolean(await getAuthorizedClient());
}

function pickPreferredSite(sites: SearchConsoleSite[], preferredSite?: string | null) {
  if (preferredSite && sites.some((site) => site.siteUrl === preferredSite)) return preferredSite;

  for (const candidate of DEFAULT_SITE_URLS) {
    const match = sites.find((site) => site.siteUrl === candidate);
    if (match) return match.siteUrl;
  }

  return sites[0]?.siteUrl ?? null;
}

function mapRows(
  rows?: Array<{
    keys?: string[] | null;
    clicks?: number | null;
    impressions?: number | null;
    ctr?: number | null;
    position?: number | null;
  }>,
) {
  return (rows ?? []).map((row) => ({
    key: row.keys?.[0] ?? "n/a",
    clicks: Number(row.clicks ?? 0),
    impressions: Number(row.impressions ?? 0),
    ctr: Number(row.ctr ?? 0),
    position: Number(row.position ?? 0),
  }));
}

function getAnalyticsRows(response?: { rows?: Array<{
  keys?: string[] | null;
  clicks?: number | null;
  impressions?: number | null;
  ctr?: number | null;
  position?: number | null;
}> | null } | null) {
  return response?.rows ?? [];
}

function getDateWindow(days = 28) {
  const end = new Date();
  const start = new Date(end);
  start.setDate(end.getDate() - Math.max(1, days));
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

async function getSearchConsoleClient(preferredSite?: string | null) {
  const auth = await getAuthorizedClient();
  if (!auth) return null;

  const searchconsole = google.searchconsole({ version: "v1", auth });
  const { data: sitesData } = await searchconsole.sites.list();
  const sites = (sitesData.siteEntry ?? [])
    .map((entry) => ({
      siteUrl: entry.siteUrl ?? "",
      permissionLevel: entry.permissionLevel ?? "siteUnverifiedUser",
    }))
    .filter((entry) => entry.siteUrl);

  const selectedSite = pickPreferredSite(sites, preferredSite);

  return {
    searchconsole,
    sites,
    selectedSite,
  };
}

export async function getSearchConsoleAudit(preferredSite?: string | null, days = 28): Promise<SearchConsoleAudit | null> {
  const client = await getSearchConsoleClient(preferredSite);
  if (!client) return null;

  const { searchconsole, sites, selectedSite } = client;
  if (!selectedSite) {
    return { sites, selectedSite: null, topPages: [], topQueries: [] };
  }

  const { startDate, endDate } = getDateWindow(days);
  const [pagesRes, queriesRes] = await Promise.all([
    searchconsole.searchanalytics.query({
      siteUrl: selectedSite,
      requestBody: {
        startDate,
        endDate,
        dimensions: ["page"],
        rowLimit: 20,
      },
    }).catch(() => null),
    searchconsole.searchanalytics.query({
      siteUrl: selectedSite,
      requestBody: {
        startDate,
        endDate,
        dimensions: ["query"],
        rowLimit: 20,
      },
    }).catch(() => null),
  ]);

  return {
    sites,
    selectedSite,
    topPages: mapRows(getAnalyticsRows(pagesRes?.data)),
    topQueries: mapRows(getAnalyticsRows(queriesRes?.data)),
  };
}

export async function getSearchConsolePageInsight(pageUrl: string, preferredSite?: string | null, days = 28): Promise<SearchConsolePageInsight | null> {
  const client = await getSearchConsoleClient(preferredSite);
  if (!client?.selectedSite) return null;

  const { searchconsole, selectedSite } = client;
  const { startDate, endDate } = getDateWindow(days);

  const [pageRes, queryRes] = await Promise.all([
    searchconsole.searchanalytics.query({
      siteUrl: selectedSite,
      requestBody: {
        startDate,
        endDate,
        dimensions: ["page"],
        dimensionFilterGroups: [
          {
            filters: [{ dimension: "page", expression: pageUrl }],
          },
        ],
        rowLimit: 1,
      },
    }).catch(() => null),
    searchconsole.searchanalytics.query({
      siteUrl: selectedSite,
      requestBody: {
        startDate,
        endDate,
        dimensions: ["query"],
        dimensionFilterGroups: [
          {
            filters: [{ dimension: "page", expression: pageUrl }],
          },
        ],
        rowLimit: 10,
      },
    }).catch(() => null),
  ]);

  const page = mapRows(getAnalyticsRows(pageRes?.data))[0] ?? null;
  const topQueries = mapRows(getAnalyticsRows(queryRes?.data));

  return {
    siteUrl: selectedSite,
    pageUrl,
    page,
    topQueries,
  };
}

export async function getSearchConsolePageMetrics(pageUrls: string[], preferredSite?: string | null, days = 28): Promise<{
  siteUrl: string | null;
  rows: SearchConsolePageMetric[];
} | null> {
  const uniquePageUrls = [...new Set(pageUrls.filter(Boolean))];
  if (uniquePageUrls.length === 0) {
    return { siteUrl: null, rows: [] };
  }

  const client = await getSearchConsoleClient(preferredSite);
  if (!client?.selectedSite) return null;

  const { searchconsole, selectedSite } = client;
  const { startDate, endDate } = getDateWindow(days);

  const pagesRes = await searchconsole.searchanalytics.query({
    siteUrl: selectedSite,
    requestBody: {
      startDate,
      endDate,
      dimensions: ["page"],
      rowLimit: Math.max(100, uniquePageUrls.length * 4),
    },
  }).catch(() => null);

  const rowMap = new Map(
    mapRows(getAnalyticsRows(pagesRes?.data)).map((row) => [
      row.key,
      {
        pageUrl: row.key,
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.ctr,
        position: row.position,
      },
    ]),
  );

  return {
    siteUrl: selectedSite,
    rows: uniquePageUrls.map((pageUrl) => rowMap.get(pageUrl)).filter((row): row is SearchConsolePageMetric => Boolean(row)),
  };
}

export async function getSearchConsolePageQueryMetrics(pageUrls: string[], preferredSite?: string | null, days = 28): Promise<{
  siteUrl: string | null;
  rows: SearchConsolePageQueryMetric[];
} | null> {
  const uniquePageUrls = [...new Set(pageUrls.filter(Boolean))];
  if (uniquePageUrls.length === 0) {
    return { siteUrl: null, rows: [] };
  }

  const client = await getSearchConsoleClient(preferredSite);
  if (!client?.selectedSite) return null;

  const { searchconsole, selectedSite } = client;
  const { startDate, endDate } = getDateWindow(days);

  const response = await searchconsole.searchanalytics.query({
    siteUrl: selectedSite,
    requestBody: {
      startDate,
      endDate,
      dimensions: ["page", "query"],
      rowLimit: Math.max(250, uniquePageUrls.length * 12),
    },
  }).catch(() => null);

  const rows = (response?.data?.rows ?? [])
    .map((row) => ({
      pageUrl: row.keys?.[0] ?? "",
      query: row.keys?.[1] ?? "",
      clicks: Number(row.clicks ?? 0),
      impressions: Number(row.impressions ?? 0),
      ctr: Number(row.ctr ?? 0),
      position: Number(row.position ?? 0),
    }))
    .filter((row) => row.pageUrl && row.query && uniquePageUrls.includes(row.pageUrl));

  return {
    siteUrl: selectedSite,
    rows,
  };
}

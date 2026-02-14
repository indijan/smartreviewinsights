export type AmazonPaapiItem = {
  asin: string;
  title: string | null;
  detailPageUrl: string | null;
  imageUrl: string | null;
  price: number | null;
  currency: string | null;
  availability: string | null;
  raw: Record<string, unknown>;
};

type AmazonCreatorsConfig = {
  credentialId: string;
  credentialSecret: string;
  credentialVersion: string;
  partnerTag: string;
  marketplace: string;
  apiBaseUrl: string;
  authUrls: string[];
};

type CachedToken = {
  accessToken: string;
  expiresAtMs: number;
};

let tokenCache: CachedToken | null = null;

export function getAmazonCreatorsConfig(): AmazonCreatorsConfig {
  const credentialId = process.env.AMAZON_CREATOR_CREDENTIAL_ID;
  const credentialSecret = process.env.AMAZON_CREATOR_CREDENTIAL_SECRET;
  const credentialVersion = process.env.AMAZON_CREATOR_CREDENTIAL_VERSION || "2.1";
  const partnerTag = process.env.AMAZON_CREATOR_PARTNER_TAG;

  if (!credentialId) throw new Error("AMAZON_CREATOR_CREDENTIAL_ID is required");
  if (!credentialSecret) throw new Error("AMAZON_CREATOR_CREDENTIAL_SECRET is required");
  if (!partnerTag) throw new Error("AMAZON_CREATOR_PARTNER_TAG is required");

  return {
    credentialId,
    credentialSecret,
    credentialVersion,
    partnerTag,
    marketplace: process.env.AMAZON_CREATOR_MARKETPLACE || process.env.AMAZON_PAAPI_MARKETPLACE || "www.amazon.com",
    apiBaseUrl: process.env.AMAZON_CREATOR_API_BASE_URL || "https://creatorsapi.amazon/catalog/v1",
    authUrls: [
      process.env.AMAZON_CREATOR_AUTH_URL || "",
      process.env.AMAZON_CREATOR_TOKEN_URL || "",
      "https://creatorsapi.auth.us-west-2.amazoncognito.com/oauth2/token",
      "https://creatorsapi.auth.us-east-1.amazoncognito.com/oauth2/token",
    ].filter((v, i, arr) => v && arr.indexOf(v) === i),
  };
}

function maskedCredentialPrefix(credentialId: string) {
  return credentialId.slice(0, 4) + "***";
}

export function getAmazonSearchDebugInfo() {
  const config = getAmazonCreatorsConfig();
  return {
    endpoint: `${config.apiBaseUrl}/searchItems`,
    authEndpoints: config.authUrls.join(","),
    authorizationHeaderFormat: `Bearer <token>, Version ${config.credentialVersion}`,
    marketplace: config.marketplace,
    credentialVersion: config.credentialVersion,
    credentialIdPrefix: maskedCredentialPrefix(config.credentialId),
  };
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function pickString(obj: Record<string, unknown>, ...paths: string[]): string | null {
  for (const path of paths) {
    const value = path.split(".").reduce<unknown>((acc, key) => {
      if (!acc || typeof acc !== "object") return undefined;
      return (acc as Record<string, unknown>)[key];
    }, obj);
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

function pickNumber(obj: Record<string, unknown>, ...paths: string[]): number | null {
  for (const path of paths) {
    const value = path.split(".").reduce<unknown>((acc, key) => {
      if (!acc || typeof acc !== "object") return undefined;
      return (acc as Record<string, unknown>)[key];
    }, obj);
    const n = toNumber(value);
    if (n !== null) return n;
  }
  return null;
}

export function normalizeAmazonItems(json: unknown): AmazonPaapiItem[] {
  const root = (json ?? {}) as Record<string, unknown>;
  const items = (((root.itemsResult as Record<string, unknown> | undefined)?.items as unknown[]) ||
    ((root.ItemsResult as Record<string, unknown> | undefined)?.Items as unknown[]) ||
    []) as Array<Record<string, unknown>>;

  return items
    .map((item) => {
      const asin = pickString(item, "asin", "ASIN");
      if (!asin) return null;

      return {
        asin,
        title: pickString(item, "itemInfo.title.displayValue", "ItemInfo.Title.DisplayValue"),
        detailPageUrl: pickString(item, "detailPageURL", "DetailPageURL"),
        imageUrl: pickString(
          item,
          "images.primary.large.url",
          "images.primary.medium.url",
          "images.primary.small.url",
          "Images.Primary.Large.URL",
          "Images.Primary.Medium.URL",
          "Images.Primary.Small.URL"
        ),
        price: pickNumber(
          item,
          "offersV2.listings.0.price.amount",
          "offers.listings.0.price.amount",
          "Offers.Listings.0.Price.Amount"
        ),
        currency: pickString(
          item,
          "offersV2.listings.0.price.currency",
          "offers.listings.0.price.currency",
          "Offers.Listings.0.Price.Currency"
        ),
        availability: pickString(
          item,
          "offersV2.listings.0.availability.message",
          "offers.listings.0.availability.message",
          "Offers.Listings.0.Availability.Message"
        ),
        raw: item,
      } satisfies AmazonPaapiItem;
    })
    .filter((v): v is AmazonPaapiItem => v !== null);
}

async function getCreatorsAccessToken(config: AmazonCreatorsConfig) {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAtMs - 15_000 > now) {
    return tokenCache.accessToken;
  }

  const basic = Buffer.from(`${config.credentialId}:${config.credentialSecret}`).toString("base64");
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    scope: "creatorsapi/default",
  });

  let accessToken: string | null = null;
  let expiresIn = 3600;
  const endpointErrors: string[] = [];

  for (const authUrl of config.authUrls) {
    const response = await fetch(authUrl, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      cache: "no-store",
    });

    const json = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
      endpointErrors.push(`${authUrl} -> ${response.status} ${JSON.stringify(json).slice(0, 160)}`);
      continue;
    }

    accessToken = typeof json.access_token === "string" ? json.access_token : null;
    expiresIn = typeof json.expires_in === "number" ? json.expires_in : 3600;
    if (accessToken) break;
    endpointErrors.push(`${authUrl} -> missing access_token`);
  }

  if (!accessToken) {
    throw new Error(`Amazon Creators token error: ${endpointErrors.join(" | ")}`);
  }

  tokenCache = {
    accessToken,
    expiresAtMs: now + expiresIn * 1000,
  };

  return accessToken;
}

async function creatorsPost(path: "/searchItems" | "/getItems", payloadObj: Record<string, unknown>) {
  const config = getAmazonCreatorsConfig();
  const accessToken = await getCreatorsAccessToken(config);
  const payload = JSON.stringify(payloadObj);

  const response = await fetch(`${config.apiBaseUrl}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}, Version ${config.credentialVersion}`,
      "Content-Type": "application/json",
      "x-marketplace": config.marketplace,
    },
    body: payload,
    cache: "no-store",
  });

  const json = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(`Amazon Creators API error ${response.status}: ${JSON.stringify(json).slice(0, 600)}`);
  }

  return json;
}

export async function fetchAmazonItemsByAsins(asins: string[]) {
  if (asins.length === 0) return [] as AmazonPaapiItem[];

  const config = getAmazonCreatorsConfig();
  const json = await creatorsPost("/getItems", {
    itemIds: asins,
    itemIdType: "ASIN",
    partnerTag: config.partnerTag,
    partnerType: "Associates",
    marketplace: config.marketplace,
    resources: [
      "images.primary.small",
      "itemInfo.title",
      "offersV2.listings.price",
      "offersV2.listings.availability.message",
    ],
  });

  return normalizeAmazonItems(json);
}

export async function searchAmazonItems(params: { keywords: string; browseNodeId?: string | null; maxItems?: number }) {
  const config = getAmazonCreatorsConfig();
  const maxItems = Math.max(1, Math.min(10, params.maxItems ?? 10));

  const payload: Record<string, unknown> = {
    keywords: params.keywords,
    searchIndex: "Electronics",
    itemCount: maxItems,
    partnerTag: config.partnerTag,
    marketplace: config.marketplace,
    resources: ["images.primary.small", "itemInfo.title", "offersV2.listings.price"],
  };

  if (params.browseNodeId) payload.browseNodeId = params.browseNodeId;

  const json = await creatorsPost("/searchItems", payload);
  return normalizeAmazonItems(json);
}

export function resetAmazonTokenCacheForTests() {
  tokenCache = null;
}

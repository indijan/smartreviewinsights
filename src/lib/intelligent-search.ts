export async function expandSearchQueryWithAi(query: string, categoryPath?: string | null) {
  const base = String(query || "").trim();
  if (!base || base.length < 3) return { effectiveQuery: base, aiUsed: false };
  if (!process.env.OPENAI_API_KEY) return { effectiveQuery: base, aiUsed: false };

  try {
    const prompt = [
      "You improve e-commerce search queries for product review discovery.",
      "Return JSON only: {\"query\":\"...\"}.",
      "Keep it concise, English, max 10 words.",
      "Do not add punctuation-heavy text.",
      categoryPath ? `Category context: ${categoryPath}` : "",
      `User query: ${base}`,
    ]
      .filter(Boolean)
      .join("\n");

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        input: prompt,
        temperature: 0.2,
      }),
    });
    if (!response.ok) return { effectiveQuery: base, aiUsed: false };
    const data = (await response.json()) as Record<string, unknown>;
    const text = String(data.output_text || "").trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) return { effectiveQuery: base, aiUsed: false };
    const parsed = JSON.parse(text.slice(start, end + 1)) as { query?: string };
    const q = String(parsed.query || "").trim();
    if (!q) return { effectiveQuery: base, aiUsed: false };
    return { effectiveQuery: q, aiUsed: true };
  } catch {
    return { effectiveQuery: base, aiUsed: false };
  }
}

type Candidate = {
  id: string;
  title: string;
  excerpt: string | null;
  canonicalName?: string | null;
};

type Ranked = {
  id: string;
  score: number;
};

function tokenize(input: string) {
  return String(input || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((x) => x.length > 1);
}

const STOP_WORDS = new Set([
  "for",
  "with",
  "and",
  "the",
  "a",
  "an",
  "to",
  "of",
  "in",
  "on",
  "by",
  "from",
  "or",
]);

function intentTokens(query: string) {
  const t = tokenize(query).filter((x) => !STOP_WORDS.has(x));
  return t.length ? t : tokenize(query);
}

function lexicalScore(query: string, c: Candidate) {
  const q = intentTokens(query);
  if (!q.length) return 0;
  const title = String(c.title || "").toLowerCase();
  const excerpt = String(c.excerpt || "").toLowerCase();
  const canonical = String(c.canonicalName || "").toLowerCase();
  const phrase = q.join(" ");
  let score = 0;
  if (title.includes(phrase)) score += 12;
  if (canonical.includes(phrase)) score += 10;
  if (excerpt.includes(phrase)) score += 6;

  for (const token of q) {
    let tokenHit = false;
    if (title.includes(token)) {
      score += 3;
      tokenHit = true;
    }
    if (canonical.includes(token)) {
      score += 3;
      tokenHit = true;
    }
    if (excerpt.includes(token)) {
      score += 1;
      tokenHit = true;
    }
    if (!tokenHit) score -= 4;
  }
  return score;
}

function hardRelevancePass(query: string, c: Candidate) {
  const q = intentTokens(query);
  const title = String(c.title || "").toLowerCase();
  const canon = String(c.canonicalName || "").toLowerCase();
  const text = `${title} ${canon}`;

  const expectsCase = q.includes("case");
  const mentionsIphone = q.includes("iphone");

  // Block common false positives like earbuds that ship with a charging case.
  if (expectsCase) {
    const isAudioProduct = /\b(earbuds?|headphones?|earphones?|airpods?)\b/.test(text);
    const chargingCaseOnly = /\bcharging case\b/.test(text);
    const isPhoneCaseLike = /\b(iphone case|phone case|magsafe case|cover|bumper)\b/.test(text);
    if (isAudioProduct && chargingCaseOnly && !isPhoneCaseLike) return false;
  }

  // If query is iPhone-focused, reject pure compatibility mentions without core intent match.
  if (mentionsIphone && expectsCase) {
    const hasIphoneCasePhrase = /\biphone\b.{0,20}\bcase\b|\bcase\b.{0,20}\biphone\b/.test(text);
    const hasPhoneCaseSignals = /\b(phone case|cover|bumper|magsafe)\b/.test(text);
    if (!hasIphoneCasePhrase && !hasPhoneCaseSignals) return false;
  }

  return true;
}

export async function rankSearchCandidatesWithAi(query: string, candidates: Candidate[]) {
  const qTokens = intentTokens(query);
  const mustMatchCount = qTokens.length <= 3 ? qTokens.length : Math.max(2, qTokens.length - 1);
  const tokenCovered = (c: Candidate) => {
    const text = `${c.title || ""} ${c.canonicalName || ""}`.toLowerCase();
    return qTokens.filter((t) => text.includes(t)).length;
  };

  const base = candidates
    .map((c) => ({ id: c.id, score: lexicalScore(query, c) }))
    .sort((a, b) => b.score - a.score);
  const strictIds = new Set(
    candidates
      .filter((c) => tokenCovered(c) >= mustMatchCount && hardRelevancePass(query, c))
      .map((c) => c.id),
  );
  const prelim = base.filter((x) => x.score >= 4 && strictIds.has(x.id));
  const shortlist = prelim.length ? prelim : base.slice(0, 20);
  const byId = new Map(candidates.map((c) => [c.id, c]));

  if (!process.env.OPENAI_API_KEY || shortlist.length === 0) {
    return {
      top: shortlist.slice(0, 3),
      others: shortlist.slice(3),
      aiUsed: false,
      noRelevant: prelim.length === 0,
    };
  }

  try {
    const payload = shortlist.slice(0, 24).map((x) => {
      const c = byId.get(x.id)!;
      return { id: c.id, title: c.title, excerpt: c.excerpt, canonicalName: c.canonicalName ?? null };
    });
    const prompt = [
      "You rank search results for a product review website.",
      "Return strict JSON only.",
      "Schema: {\"noRelevant\":boolean,\"topIds\":[\"id1\",\"id2\",\"id3\"]}",
      "Rules: choose max 3 highly relevant results for the user query.",
      "If none clearly relevant, set noRelevant=true and topIds=[].",
      `User query: ${query}`,
      `Candidates: ${JSON.stringify(payload)}`,
    ].join("\n");

    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        input: prompt,
        temperature: 0.1,
      }),
    });
    if (!res.ok) throw new Error("ai rank failed");
    const json = (await res.json()) as Record<string, unknown>;
    const text = String(json.output_text || "");
    const s = text.indexOf("{");
    const e = text.lastIndexOf("}");
    if (s < 0 || e <= s) throw new Error("invalid ai json");
    const parsed = JSON.parse(text.slice(s, e + 1)) as { noRelevant?: boolean; topIds?: string[] };
    const topSet = new Set((parsed.topIds || []).slice(0, 3));
    const top = shortlist.filter((x) => topSet.has(x.id) && strictIds.has(x.id)).slice(0, 3);
    const others = shortlist.filter((x) => !topSet.has(x.id));
    return {
      top,
      others,
      aiUsed: true,
      noRelevant: Boolean(parsed.noRelevant) || top.length === 0,
    };
  } catch {
    return {
      top: prelim.slice(0, 3),
      others: prelim.slice(3),
      aiUsed: false,
      noRelevant: prelim.length === 0,
    };
  }
}

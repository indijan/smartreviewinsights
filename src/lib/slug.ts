export function normalizeSlug(input: string): string {
  return input.trim().replace(/^\/+|\/+$/g, "");
}

export function joinSlug(parts: string[]): string {
  return normalizeSlug(parts.join("/"));
}

import crypto from "node:crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB

function extensionFromUrl(url: string) {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    const m = pathname.match(/\.(jpg|jpeg|png|webp|gif|avif|svg)$/i);
    return m?.[1] ? `.${m[1]}` : "";
  } catch {
    return "";
  }
}

function extensionFromContentType(contentType: string | null) {
  const ct = String(contentType || "").toLowerCase();
  if (ct.includes("image/jpeg")) return ".jpg";
  if (ct.includes("image/png")) return ".png";
  if (ct.includes("image/webp")) return ".webp";
  if (ct.includes("image/gif")) return ".gif";
  if (ct.includes("image/avif")) return ".avif";
  if (ct.includes("image/svg+xml")) return ".svg";
  return "";
}

function contentTypeFromExt(ext: string) {
  switch (ext.toLowerCase()) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".avif":
      return "image/avif";
    case ".svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}

function createR2Client() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) return null;

  const endpoint = process.env.R2_ENDPOINT || `https://${accountId}.r2.cloudflarestorage.com`;
  return new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });
}

export async function mirrorImagesToR2(urls: string[], keyPrefix: string, maxItems = 4) {
  const r2 = createR2Client();
  const bucket = process.env.R2_BUCKET;
  const publicBase = process.env.R2_PUBLIC_BASE_URL;
  if (!r2 || !bucket || !publicBase) return urls.slice(0, maxItems);

  const out: string[] = [];
  const unique = Array.from(new Set(urls.filter(Boolean))).slice(0, maxItems);

  for (const src of unique) {
    try {
      const res = await fetch(src, {
        method: "GET",
        cache: "no-store",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });
      if (!res.ok) continue;
      const buffer = Buffer.from(await res.arrayBuffer());
      if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) continue;
      const contentTypeHeader = res.headers.get("content-type");
      const ext =
        extensionFromContentType(contentTypeHeader) ||
        extensionFromUrl(src) ||
        ".jpg";
      const key = `uploads/auto/${keyPrefix}/${crypto
        .createHash("sha1")
        .update(src)
        .digest("hex")}${ext}`;

      await r2.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: buffer,
          ContentType: contentTypeFromExt(ext),
        }),
      );

      out.push(`${publicBase.replace(/\/+$/, "")}/${key}`);
    } catch {
      continue;
    }
  }

  return out.length ? out : urls.slice(0, maxItems);
}


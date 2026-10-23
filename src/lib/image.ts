import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";

// Vercel Functions reject request bodies over 4.5 MB before our code runs, so
// stay below that (phones send ~0.2–1 MB after client-side compression).
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const MAX_EDGE = 1280;

/** Identify the real format from magic bytes — never trust the client's MIME type. */
export function sniffImage(buf: Buffer): "jpeg" | "png" | "webp" | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "webp";
  return null;
}

/**
 * Decode + re-encode: applies EXIF rotation, strips all metadata (GPS etc.),
 * caps the long edge and normalises to JPEG. Anything that isn't a real image
 * fails to decode here.
 */
export async function normaliseImage(input: Buffer) {
  const { data, info } = await sharp(input, { limitInputPixels: 50_000_000, failOn: "error" })
    .rotate()
    .resize(MAX_EDGE, MAX_EDGE, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 80, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, sha256: createHash("sha256").update(data).digest("hex") };
}

const DEV_SALT = "realm-hack-dev-salt";

/**
 * Salt for hashing device/IP identifiers. Production must set a real secret:
 * a missing or short salt returns null so the caller fails closed instead of
 * silently hashing with a public default.
 */
export function submitterSalt(): string | null {
  const salt = process.env.SUBMITTER_HASH_SALT;
  if (salt && salt.length >= 16) return salt;
  return process.env.NODE_ENV === "production" ? null : DEV_SALT;
}

export function hashWithSalt(value: string, salt: string) {
  return createHash("sha256").update(`${salt}:${value}`).digest("hex");
}

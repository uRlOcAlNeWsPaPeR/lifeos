import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { googleEnv } from "./env";

// AES-256-GCM encryption for Google OAuth tokens at rest. The key is derived
// from GOOGLE_TOKEN_SECRET; that secret is never exposed to the browser and the
// ciphertext lives only in the server-only `googleConnections` collection.

const ALGO = "aes-256-gcm";

function key(): Buffer {
  if (!googleEnv.tokenSecret) {
    throw new Error("GOOGLE_TOKEN_SECRET is not set — cannot encrypt Google tokens.");
  }
  return createHash("sha256").update(googleEnv.tokenSecret).digest();
}

/** Returns "iv:authTag:ciphertext", each part base64. */
export function encryptToken(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(":");
}

/** Inverse of `encryptToken`. Throws on tampering or a wrong key. */
export function decryptToken(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(":");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Malformed encrypted token.");
  const decipher = createDecipheriv(ALGO, key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/** Constant-time string compare (for HMAC verification). */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

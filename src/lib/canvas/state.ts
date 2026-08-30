import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { canvasEnv } from "./env";
import { safeEqual } from "./crypto";

// The OAuth `state` parameter. Canvas hands it back on the callback with no auth
// header, so it must (a) prove the request originated from us — CSRF protection —
// and (b) carry the LifeOS user id + chosen instance so the callback knows whose
// connection to store. HMAC-signed + short expiry; not encrypted (no secrets in it).

const TTL_MS = 10 * 60 * 1000; // 10 minutes

export interface CanvasOAuthState {
  uid: string;
  instanceUrl: string;
  /** Where the user started the flow, so we can send them back. */
  origin: "settings" | "onboarding" | "school";
  /** epoch ms */
  iat: number;
  /** random, single-use-ish */
  nonce: string;
}

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString("base64url");
}

function sign(payloadB64: string): string {
  if (!canvasEnv.stateSecret) throw new Error("CANVAS_STATE_SECRET is not set.");
  return createHmac("sha256", canvasEnv.stateSecret).update(payloadB64).digest("base64url");
}

export function signState(input: Omit<CanvasOAuthState, "iat" | "nonce">): string {
  const state: CanvasOAuthState = {
    ...input,
    iat: Date.now(),
    nonce: b64url(randomBytes(16)),
  };
  const payload = b64url(JSON.stringify(state));
  return `${payload}.${sign(payload)}`;
}

export function verifyState(raw: string): CanvasOAuthState {
  const [payload, sig] = (raw ?? "").split(".");
  if (!payload || !sig) throw stateError("Missing or malformed state.");
  if (!safeEqual(sig, sign(payload))) throw stateError("State signature check failed.");

  let parsed: CanvasOAuthState;
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    throw stateError("State payload is not valid JSON.");
  }
  if (!parsed.uid || !parsed.instanceUrl || typeof parsed.iat !== "number") {
    throw stateError("State payload is incomplete.");
  }
  if (Date.now() - parsed.iat > TTL_MS) {
    throw stateError("This authorization link has expired. Please try connecting again.");
  }
  return parsed;
}

function stateError(message: string): Error {
  const err = new Error(message);
  (err as { status?: number }).status = 400;
  (err as { canvasState?: boolean }).canvasState = true;
  return err;
}

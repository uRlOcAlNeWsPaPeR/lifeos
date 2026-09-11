import "server-only";
import {
  getApps,
  initializeApp,
  cert,
  applicationDefault,
  type App,
} from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function loadServiceAccount(): Record<string, string> | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64?.trim();
  const json = raw || (b64 ? Buffer.from(b64, "base64").toString("utf8") : "");
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    // env parsers sometimes turn \n into literal backslash-n
    if (parsed.private_key) parsed.private_key = String(parsed.private_key).replace(/\\n/g, "\n");
    return parsed;
  } catch {
    console.error("[firebase-admin] FIREBASE_SERVICE_ACCOUNT is not valid JSON");
    return null;
  }
}

let adminApp: App | null = null;

function ensureAdmin(): App {
  if (adminApp) return adminApp;
  if (getApps().length) {
    adminApp = getApps()[0];
    return adminApp;
  }
  const sa = loadServiceAccount();
  if (sa) {
    adminApp = initializeApp({
      credential: cert(sa as never),
      projectId: sa.project_id,
    });
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.FUNCTION_TARGET) {
    // GCP / Firebase hosting: use Application Default Credentials
    adminApp = initializeApp({ credential: applicationDefault() });
  } else {
    throw new Error(
      "Firebase Admin is not configured. Set FIREBASE_SERVICE_ACCOUNT in .env (see .env.example).",
    );
  }
  return adminApp;
}

export function adminAuth() {
  return getAuth(ensureAdmin());
}

export function adminDb() {
  return getFirestore(ensureAdmin());
}

export const adminConfigured = Boolean(
  process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT_B64,
);

/** Verify the "Authorization: Bearer <idToken>" header. Returns the uid or throws. */
export async function requireUid(req: Request): Promise<string> {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) {
    const err = new Error("Missing auth token");
    (err as { status?: number }).status = 401;
    throw err;
  }
  try {
    const decoded = await adminAuth().verifyIdToken(token);
    return decoded.uid;
  } catch {
    const err = new Error("Invalid or expired session");
    (err as { status?: number }).status = 401;
    throw err;
  }
}

/** Same as {@link requireUid}, but for endpoints that work signed-out too —
 *  returns null instead of throwing when there's no (or an invalid) token. */
export async function optionalUid(req: Request): Promise<string | null> {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return null;
  try {
    return (await adminAuth().verifyIdToken(token)).uid;
  } catch {
    return null;
  }
}

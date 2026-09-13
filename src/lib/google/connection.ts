import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import { encryptToken } from "./crypto";
import type { GoogleConnectionDoc, GoogleTokenResponse } from "./types";

// Read / write the server-only Google connection. Firestore rules deny all
// client access to this collection — only the Admin SDK (here) touches it.

const COLLECTION = "googleConnections";

function ref(uid: string) {
  return adminDb().collection(COLLECTION).doc(uid);
}

export async function getConnection(uid: string): Promise<GoogleConnectionDoc | null> {
  const snap = await ref(uid).get();
  return snap.exists ? (snap.data() as GoogleConnectionDoc) : null;
}

export async function requireConnection(uid: string): Promise<GoogleConnectionDoc> {
  const conn = await getConnection(uid);
  if (!conn) {
    const err = new Error("Google Calendar is not connected.");
    (err as { status?: number }).status = 409;
    throw err;
  }
  return conn;
}

/** Create / replace the connection after a successful OAuth code exchange. */
export async function saveNewConnection(params: {
  uid: string;
  token: GoogleTokenResponse;
}): Promise<GoogleConnectionDoc> {
  const { uid, token } = params;
  const now = new Date().toISOString();
  const existing = await getConnection(uid);

  const doc: GoogleConnectionDoc = {
    uid,
    accessTokenEnc: encryptToken(token.access_token),
    refreshTokenEnc: token.refresh_token
      ? encryptToken(token.refresh_token)
      : (existing?.refreshTokenEnc ?? null),
    accessTokenExpiresAt: token.expires_in
      ? new Date(Date.now() + token.expires_in * 1000).toISOString()
      : null,
    scope: token.scope ?? null,
    status: "connected",
    lastError: null,
    lastSyncedAt: existing?.lastSyncedAt ?? null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await ref(uid).set(doc);
  return doc;
}

/** Persist a refreshed access token (Google doesn't re-issue the refresh token). */
export async function updateAccessToken(uid: string, token: GoogleTokenResponse): Promise<void> {
  await ref(uid).set(
    {
      accessTokenEnc: encryptToken(token.access_token),
      accessTokenExpiresAt: token.expires_in
        ? new Date(Date.now() + token.expires_in * 1000).toISOString()
        : null,
      status: "connected",
      lastError: null,
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );
}

export async function markConnection(
  uid: string,
  patch: Partial<Pick<GoogleConnectionDoc, "status" | "lastError" | "lastSyncedAt">>,
): Promise<void> {
  await ref(uid).set({ ...patch, updatedAt: new Date().toISOString() }, { merge: true });
}

export async function deleteConnection(uid: string): Promise<void> {
  await ref(uid).delete();
}

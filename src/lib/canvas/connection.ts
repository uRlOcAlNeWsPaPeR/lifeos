import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import { encryptToken } from "./crypto";
import type { CanvasConnectionDoc, CanvasTokenResponse } from "./types";

// Read / write the server-only Canvas connection. Firestore rules deny all client
// access to this collection — only the Admin SDK (here) touches it.

const COLLECTION = "canvasConnections";

function ref(uid: string) {
  return adminDb().collection(COLLECTION).doc(uid);
}

export async function getConnection(uid: string): Promise<CanvasConnectionDoc | null> {
  const snap = await ref(uid).get();
  return snap.exists ? (snap.data() as CanvasConnectionDoc) : null;
}

export async function requireConnection(uid: string): Promise<CanvasConnectionDoc> {
  const conn = await getConnection(uid);
  if (!conn) {
    const err = new Error("Canvas is not connected.");
    (err as { status?: number }).status = 409;
    throw err;
  }
  return conn;
}

/** Create / replace the connection after a successful OAuth code exchange. */
export async function saveNewConnection(params: {
  uid: string;
  instanceUrl: string;
  token: CanvasTokenResponse;
}): Promise<CanvasConnectionDoc> {
  const { uid, instanceUrl, token } = params;
  const now = new Date().toISOString();
  const existing = await getConnection(uid);

  const doc: CanvasConnectionDoc = {
    uid,
    instanceUrl,
    authMode: "oauth",
    canvasUserId: token.user?.id != null ? String(token.user.id) : (existing?.canvasUserId ?? ""),
    canvasUserName: token.user?.name ?? existing?.canvasUserName ?? null,
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

/**
 * DEV ONLY. Store a connection from a pasted Canvas personal access token.
 * No refresh token, no expiry handling — the token lives until the user revokes
 * it in Canvas.
 */
export async function savePersonalTokenConnection(params: {
  uid: string;
  instanceUrl: string;
  accessToken: string;
  canvasUserId: string;
  canvasUserName: string | null;
}): Promise<CanvasConnectionDoc> {
  const { uid, instanceUrl, accessToken, canvasUserId, canvasUserName } = params;
  const now = new Date().toISOString();
  const existing = await getConnection(uid);

  const doc: CanvasConnectionDoc = {
    uid,
    instanceUrl,
    authMode: "personal_token",
    canvasUserId,
    canvasUserName,
    accessTokenEnc: encryptToken(accessToken),
    refreshTokenEnc: null,
    accessTokenExpiresAt: null,
    scope: null,
    status: "connected",
    lastError: null,
    lastSyncedAt: existing?.lastSyncedAt ?? null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await ref(uid).set(doc);
  return doc;
}

/** Persist a refreshed access token (refresh token is unchanged). */
export async function updateAccessToken(
  uid: string,
  token: CanvasTokenResponse,
): Promise<void> {
  await ref(uid).set(
    {
      accessTokenEnc: encryptToken(token.access_token),
      accessTokenExpiresAt: token.expires_in
        ? new Date(Date.now() + token.expires_in * 1000).toISOString()
        : null,
      ...(token.refresh_token ? { refreshTokenEnc: encryptToken(token.refresh_token) } : {}),
      status: "connected",
      lastError: null,
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );
}

/**
 * Persist the student's course choice. `null` = sync every active course (and
 * automatically include courses added later); an array = only those Canvas ids.
 */
export async function setCourseSelection(
  uid: string,
  selectedCanvasCourseIds: string[] | null,
): Promise<void> {
  await ref(uid).set(
    { selectedCanvasCourseIds, updatedAt: new Date().toISOString() },
    { merge: true },
  );
}

export async function markConnection(
  uid: string,
  patch: Partial<
    Pick<CanvasConnectionDoc, "status" | "lastError" | "lastSyncedAt">
  >,
): Promise<void> {
  await ref(uid).set({ ...patch, updatedAt: new Date().toISOString() }, { merge: true });
}

export async function deleteConnection(uid: string): Promise<void> {
  await ref(uid).delete();
}

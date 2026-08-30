"use client";

import { getDoc, setDoc } from "firebase/firestore";
import type { User } from "firebase/auth";
import { userDoc, emptyProfile } from "./schema";

/** Create the users/{uid} profile doc on first sign-in. Idempotent. */
export async function ensureProfile(user: User): Promise<{ onboarded: boolean }> {
  const ref = userDoc(user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    return { onboarded: Boolean(snap.data().onboardedAt) };
  }
  await setDoc(
    ref,
    emptyProfile(user.displayName || user.email?.split("@")[0] || "there", user.email || ""),
  );
  return { onboarded: false };
}

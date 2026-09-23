import { adminAuth } from "@/lib/firebase/admin";
import { canvasPersonalToken } from "@/lib/canvas/env";

/**
 * May this LifeOS account use the paste-token path? Checks every email on the
 * account — the top-level one AND each linked provider's (Google, password…) —
 * because Firebase doesn't always put the sign-in email at the top level.
 */
export async function personalTokenAllowedFor(uid: string): Promise<boolean> {
  if (!canvasPersonalToken.enabled) return false;
  if (canvasPersonalToken.allowAll) return true;
  const user = await adminAuth().getUser(uid).catch(() => null);
  if (!user) return false;
  const emails = [user.email, ...user.providerData.map((p) => p.email)];
  return emails.some((e) => canvasPersonalToken.allows(e));
}

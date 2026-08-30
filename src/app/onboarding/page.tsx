"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getDoc } from "firebase/firestore";
import { useAuth } from "@/lib/firebase/auth-context";
import { userDoc } from "@/lib/firebase/schema";
import { ensureProfile } from "@/lib/firebase/profile";
import { FullscreenLoader, FirebaseNotConfigured } from "@/components/app/gates";
import { OnboardingWizard } from "./wizard";

export default function OnboardingPage() {
  const router = useRouter();
  const { user, initializing, configured } = useAuth();
  const [state, setState] = useState<"checking" | "show">("checking");

  useEffect(() => {
    if (initializing) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    (async () => {
      await ensureProfile(user);
      const snap = await getDoc(userDoc(user.uid));
      if (snap.exists() && snap.data().onboardedAt) {
        router.replace("/dashboard");
      } else {
        setState("show");
      }
    })();
  }, [initializing, user, router]);

  if (!configured) return <FirebaseNotConfigured />;
  if (state === "checking" || !user) return <FullscreenLoader />;

  return <OnboardingWizard uid={user.uid} defaultName={user.displayName || ""} />;
}

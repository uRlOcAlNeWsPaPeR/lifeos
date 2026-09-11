"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useAppData } from "@/lib/store/app-data";

/**
 * The free-tier upsell for an AI page. Free plan never touches a paid model —
 * every AI feature runs on the offline heuristic engine for it — so this pops
 * once per visit to remind the student what Student+ actually buys them.
 * Student+ (and creator/comped accounts, which already resolve to student_plus)
 * never see it.
 */
export function UpgradeAd({ feature }: { feature: string }) {
  const { data } = useAppData();
  const isFree = data.profile.plan === "free";
  const [open, setOpen] = useState(false);

  // Fires once per mount — i.e. every time the student lands on this page.
  useEffect(() => {
    if (isFree) setOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!isFree) return null;

  return (
    <Modal open={open} onClose={() => setOpen(false)} title="Get more out of the AI" className="max-w-sm">
      <div className="flex items-center gap-2 text-sm font-medium text-primary">
        <Sparkles className="h-4 w-4" />
        LifeOS Student+
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        {feature} runs on LifeOS&apos;s offline engine on the Free plan — real, useful, but not the
        full AI model. Student+ unlocks the real model plus 20 Brain Dumps a week and 30 Assistant
        questions a day.
      </p>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Maybe later
        </Button>
        <Link href="/settings?tab=plan" onClick={() => setOpen(false)}>
          <Button>See Student+</Button>
        </Link>
      </div>
    </Modal>
  );
}

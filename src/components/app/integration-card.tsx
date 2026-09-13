"use client";

import { useState } from "react";
import Link from "next/link";
import { Plug } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { IntegrationCardInfo } from "@/lib/integrations/descriptors";

/** One "Connect X" tile — Canvas, a calendar provider, etc. Shared by the School
 *  and Calendar pages. Real capability checks live server-side; this only renders.
 *  An integration that's actually wired up carries `settingsHref` and sends the
 *  student to its real connect UI in Settings. */
export function IntegrationCard({ integration }: { integration: IntegrationCardInfo }) {
  const [msg, setMsg] = useState<string | null>(null);
  const comingSoon = integration.status === "coming_soon";
  const href = !comingSoon ? integration.settingsHref : undefined;

  const button = (
    <Button
      variant="outline"
      size="sm"
      className="mt-4 self-start"
      disabled={comingSoon}
      {...(href
        ? {}
        : {
            onClick: () =>
              setMsg(
                `${integration.name} isn't available yet — it will connect through an official API / approved integration in a future release. We'll never ask for your school password.`,
              ),
          })}
    >
      {comingSoon ? "Not available yet" : "Connect"}
    </Button>
  );

  return (
    <Card className="flex flex-col p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-primary">
            <Plug className="h-4 w-4" />
          </div>
          <span className="font-medium">{integration.name}</span>
        </div>
        <Badge tone={comingSoon ? "muted" : "success"}>
          {comingSoon ? "Coming soon" : "Available"}
        </Badge>
      </div>
      <p className="mt-3 flex-1 text-sm text-muted-foreground">{integration.blurb}</p>
      {href ? (
        <Link href={href} className="self-start">
          {button}
        </Link>
      ) : (
        button
      )}
      {msg && <p className="mt-2 text-xs text-muted-foreground">{msg}</p>}
    </Card>
  );
}

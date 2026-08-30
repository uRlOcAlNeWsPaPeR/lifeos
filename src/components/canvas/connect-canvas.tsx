"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normalizeCanvasUrl, schoolNameFromHost } from "@/lib/canvas/url";
import type { CanvasStatusDTO } from "@/lib/canvas/types";

/**
 * The "connect your Canvas" widget. Reused in onboarding, Settings and School.
 *
 * - OAuth mode (shipping): enter your Canvas address → sign in on Canvas in a popup.
 * - Personal-token mode (CANVAS_ALLOW_PERSONAL_TOKEN, dev only): paste an access
 *   token you generated in Canvas → Account → Settings.
 * Either way LifeOS never sees your Canvas password.
 */
export function ConnectCanvas({
  status,
  busy,
  onConnect,
  onConnectToken,
}: {
  status: CanvasStatusDTO | null;
  busy: boolean;
  onConnect: (instanceUrl: string) => void;
  onConnectToken?: (instanceUrl: string, accessToken: string) => void;
}) {
  const lockedHost = hostOf(status?.lockedInstanceUrl);
  const [value, setValue] = useState(
    status?.lockedInstanceUrl ?? status?.defaultInstanceUrl ?? "",
  );
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (status && !status.configured) {
    return (
      <p className="text-sm text-muted-foreground">
        Canvas isn&apos;t set up on this deployment yet. Once an administrator adds the
        Canvas credentials, you&apos;ll be able to connect here.
      </p>
    );
  }

  const resolveUrl = () => {
    if (status?.lockedInstanceUrl) return normalizeCanvasUrl(status.lockedInstanceUrl);
    return normalizeCanvasUrl(value);
  };

  /* ---------------- personal-token mode (dev only) ---------------- */
  if (status?.personalTokenMode && onConnectToken) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const n = resolveUrl();
          if (!n.ok) return setError(n.error ?? "Check the Canvas address.");
          if (token.trim().length < 20) return setError("Paste a valid Canvas access token.");
          setError(null);
          onConnectToken(n.url, token.trim());
        }}
        className="space-y-2.5"
      >
        {!status.lockedInstanceUrl && (
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="canvas.yourschool.edu"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            aria-label="Your Canvas web address"
          />
        )}
        <Input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Canvas access token"
          autoComplete="off"
          spellCheck={false}
          aria-label="Canvas personal access token"
        />
        <Button type="submit" loading={busy}>
          Connect Canvas
        </Button>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <p className="text-xs text-muted-foreground">
          Dev mode: in Canvas go to <b>Account → Settings → Approved Integrations → New
          Access Token</b>, then paste it here. It&apos;s stored encrypted on the server
          and never sent to the browser.
        </p>
      </form>
    );
  }

  /* ---------------- OAuth: single-institution ---------------- */
  if (status?.lockedInstanceUrl) {
    return (
      <div className="space-y-2.5">
        <Button loading={busy} onClick={() => onConnect(status.lockedInstanceUrl!)}>
          Connect Canvas
        </Button>
        <p className="text-xs text-muted-foreground">
          Signs you in on {schoolNameFromHost(lockedHost)}&apos;s Canvas ({lockedHost}).
          LifeOS never sees your password.
        </p>
      </div>
    );
  }

  /* ---------------- OAuth: enter your institution ---------------- */
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const n = normalizeCanvasUrl(value);
        if (!n.ok) return setError(n.error ?? "That doesn't look like a Canvas address.");
        setError(null);
        onConnect(n.url);
      }}
      className="space-y-2.5"
    >
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="canvas.yourschool.edu"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          aria-label="Your Canvas web address"
          className="sm:flex-1"
        />
        <Button type="submit" loading={busy} className="shrink-0">
          Connect Canvas
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">
        You&apos;ll sign in on your school&apos;s own Canvas page. LifeOS never sees your
        password — only the courses and assignments you approve.
      </p>
    </form>
  );
}

function hostOf(url: string | null | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

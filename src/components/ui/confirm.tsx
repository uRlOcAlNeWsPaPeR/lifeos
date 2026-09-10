"use client";

import * as React from "react";
import { Modal } from "./modal";
import { Button } from "./button";

// In-app replacement for window.confirm(). Same call-from-anywhere ergonomics as
// `toast()` — a single mounted <ConfirmHost/> backs a module-level `confirm()`
// that returns a promise resolving true (confirmed) or false (cancelled / Esc /
// backdrop). No native browser dialog, so it can be styled and won't freeze the
// Chrome extension automation.

export interface ConfirmOptions {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button + used for irreversible-ish actions. */
  destructive?: boolean;
}

let externalConfirm: ((opts: ConfirmOptions) => Promise<boolean>) | null = null;

export function confirm(opts: ConfirmOptions): Promise<boolean> {
  // If the host isn't mounted (SSR, tests) fail closed — nothing happens.
  return externalConfirm ? externalConfirm(opts) : Promise.resolve(false);
}

export function ConfirmHost() {
  const [state, setState] = React.useState<{
    opts: ConfirmOptions;
    resolve: (v: boolean) => void;
  } | null>(null);

  React.useEffect(() => {
    externalConfirm = (opts) =>
      new Promise<boolean>((resolve) => setState({ opts, resolve }));
    return () => {
      externalConfirm = null;
    };
  }, []);

  const close = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };

  return (
    <Modal
      open={Boolean(state)}
      onClose={() => close(false)}
      title={state?.opts.title}
      description={state?.opts.body}
      className="max-w-sm"
    >
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={() => close(false)}>
          {state?.opts.cancelLabel ?? "Cancel"}
        </Button>
        <Button
          variant={state?.opts.destructive ? "destructive" : "primary"}
          onClick={() => close(true)}
          autoFocus
        >
          {state?.opts.confirmLabel ?? "Confirm"}
        </Button>
      </div>
    </Modal>
  );
}

"use client";

// Thin wrapper around the browser Notification API.
// Honest about limits: a web page can only notify while the browser is running
// and permission is granted. This layer is structured so a service worker /
// native bridge can be swapped in later without touching call sites.

export type NotifyPermission = "default" | "granted" | "denied" | "unsupported";

export function notifyPermission(): NotifyPermission {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission as NotifyPermission;
}

export async function requestNotifyPermission(): Promise<NotifyPermission> {
  if (notifyPermission() === "unsupported") return "unsupported";
  if (Notification.permission !== "default") return Notification.permission as NotifyPermission;
  try {
    return (await Notification.requestPermission()) as NotifyPermission;
  } catch {
    return "denied";
  }
}

let audioCtx: AudioContext | null = null;

/** A short, non-jarring chime. Requires a prior user gesture on most browsers. */
export function playChime(kind: "alarm" | "reminder" = "reminder") {
  try {
    audioCtx =
      audioCtx ??
      new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const ctx = audioCtx;
    const notes = kind === "alarm" ? [880, 1320, 880, 1320] : [660, 880];
    notes.forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = f;
      o.connect(g);
      g.connect(ctx.destination);
      const t = ctx.currentTime + i * 0.22;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      o.start(t);
      o.stop(t + 0.22);
    });
  } catch {
    /* audio not available */
  }
}

export interface NotifyOptions {
  body?: string;
  tag?: string; // dedupe key — a later notification with the same tag replaces the earlier
  sound?: boolean;
  kind?: "alarm" | "reminder";
  onClick?: () => void;
}

/** Fire a notification. Returns true if the OS notification was shown. */
export function notify(title: string, opts: NotifyOptions = {}): boolean {
  if (opts.sound) playChime(opts.kind);
  if (notifyPermission() !== "granted") return false;
  try {
    const n = new Notification(title, {
      body: opts.body,
      tag: opts.tag,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      requireInteraction: opts.kind === "alarm",
    });
    if (opts.onClick) {
      n.onclick = () => {
        window.focus();
        opts.onClick?.();
        n.close();
      };
    }
    return true;
  } catch {
    return false;
  }
}

/** Is `now` inside the quiet-hours window (handles windows crossing midnight)? */
export function inQuietHours(quietStart: string, quietEnd: string, now = new Date()): boolean {
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  const cur = now.getHours() * 60 + now.getMinutes();
  const s = toMin(quietStart);
  const e = toMin(quietEnd);
  if (s === e) return false;
  return s < e ? cur >= s && cur < e : cur >= s || cur < e;
}

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

// Registered once per page load, lazily. Some browsers — Android Chrome in
// particular — refuse `new Notification()` outright and require the
// notification to be shown through a service worker instead
// (`registration.showNotification()`). This exists purely to make that path
// available; it does no caching or push handling of its own.
let swReady: Promise<ServiceWorkerRegistration | null> | null = null;
function ensureServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return Promise.resolve(null);
  if (!swReady) {
    swReady = navigator.serviceWorker
      .register("/sw.js")
      .then(() => navigator.serviceWorker.ready)
      .catch(() => null);
  }
  return swReady;
}

export interface NotifyResult {
  /** Permission was granted, so a show was attempted. */
  attempted: boolean;
  /** The OS notification API call actually succeeded. */
  shown: boolean;
  via: "service-worker" | "window" | "none";
  error?: string;
}

async function showNotification(title: string, opts: NotifyOptions): Promise<NotifyResult> {
  const body: NotificationOptions = {
    body: opts.body,
    tag: opts.tag,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    requireInteraction: opts.kind === "alarm",
  };

  const reg = await ensureServiceWorker();
  if (reg) {
    try {
      await reg.showNotification(title, body);
      return { attempted: true, shown: true, via: "service-worker" };
    } catch {
      // fall through to the plain constructor
    }
  }
  try {
    const n = new Notification(title, body);
    if (opts.onClick) {
      n.onclick = () => {
        window.focus();
        opts.onClick?.();
        n.close();
      };
    }
    return { attempted: true, shown: true, via: "window" };
  } catch (e) {
    return { attempted: true, shown: false, via: "none", error: e instanceof Error ? e.message : String(e) };
  }
}

/** Fire a notification. Returns true once permission is granted and a show
 *  was attempted — use `notifyAndReport` when you need to know it actually
 *  displayed (e.g. a "send test notification" button). */
export function notify(title: string, opts: NotifyOptions = {}): boolean {
  if (opts.sound) playChime(opts.kind);
  if (notifyPermission() !== "granted") return false;
  void showNotification(title, opts);
  return true;
}

/** Same as `notify`, but resolves once the notification has actually been
 *  shown (or failed to show) instead of firing and forgetting. */
export async function notifyAndReport(title: string, opts: NotifyOptions = {}): Promise<NotifyResult> {
  if (opts.sound) playChime(opts.kind);
  if (notifyPermission() !== "granted") return { attempted: false, shown: false, via: "none" };
  return showNotification(title, opts);
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

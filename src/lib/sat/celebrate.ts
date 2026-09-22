"use client";

// ScoreClimb's two small rewards for a right answer — a two-note chime
// synthesised on the fly (no audio files) and a confetti burst — recoloured to
// the LifeOS palette. Both fail silently where the browser won't allow them,
// and confetti respects reduced-motion.

let audio: AudioContext | null = null;

function tone(ctx: AudioContext, freq: number, start: number, dur: number, gain = 0.18) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  osc.connect(g);
  g.connect(ctx.destination);
  const t0 = ctx.currentTime + start;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.015);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export function playCorrect() {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    audio ??= new Ctor();
    if (audio.state === "suspended") void audio.resume();
    tone(audio, 659.25, 0, 0.14);
    tone(audio, 987.77, 0.09, 0.22);
  } catch {
    /* audio unsupported or blocked */
  }
}

// LifeOS brand greens and teals, plus a warm accent so a burst still reads as
// celebration rather than a status colour.
const COLORS = ["#17b866", "#10b981", "#4bd6a0", "#0fb9a8", "#7fe6a8", "#fbbf24"];

interface Particle {
  x: number; y: number; vx: number; vy: number;
  size: number; color: string; rot: number; vr: number; life: number;
}

let canvas: HTMLCanvasElement | null = null;
let particles: Particle[] = [];
let raf: number | null = null;

function ensureCanvas() {
  if (canvas) return canvas;
  canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, {
    position: "fixed", inset: "0", width: "100%", height: "100%",
    pointerEvents: "none", zIndex: "130", display: "none",
  });
  document.body.appendChild(canvas);
  const resize = () => {
    canvas!.width = innerWidth;
    canvas!.height = innerHeight;
  };
  addEventListener("resize", resize);
  resize();
  return canvas;
}

function tick() {
  const c = canvas!;
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, c.width, c.height);
  particles = particles.filter((p) => p.life > 0 && p.y < c.height + 20);
  for (const p of particles) {
    p.x += p.vx; p.y += p.vy; p.vy += 0.35; p.rot += p.vr; p.life--;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.fillStyle = p.color;
    ctx.globalAlpha = Math.min(1, p.life / 40);
    ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
    ctx.restore();
  }
  raf = particles.length ? requestAnimationFrame(tick) : null;
  if (!particles.length) {
    ctx.clearRect(0, 0, c.width, c.height);
    c.style.display = "none";
  }
}

export function confetti(n = 60, y?: number) {
  if (typeof window === "undefined") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const c = ensureCanvas();
  c.style.display = "block";
  const originY = y ?? innerHeight * 0.35;
  for (let i = 0; i < n; i++) {
    particles.push({
      x: innerWidth / 2 + (Math.random() - 0.5) * 200,
      y: originY,
      vx: (Math.random() - 0.5) * 12,
      vy: -Math.random() * 11 - 3,
      size: Math.random() * 8 + 4,
      color: COLORS[(Math.random() * COLORS.length) | 0],
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      life: 90 + Math.random() * 40,
    });
  }
  if (!raf) tick();
}

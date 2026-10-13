"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import type { BrainGraph } from "@/lib/brain/graph";
import { DAY_MS, ageLabel } from "@/lib/brain/time";
import { kindColor } from "./kind-style";

interface View {
  zoom: number;
  x: number;
  y: number;
}

const MIN_ZOOM = 0.35;
const MAX_ZOOM = 6;
const INTRO_MS = 900;
/** Memories fade as they age — three years back is dim, but never gone. */
const FADE_DAYS = 1100;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * The web itself, drawn on a 2D canvas: nodes are memories, lines are what
 * they share, big rings are courses and subjects they hang off. Older memories
 * are dimmer, the way old ones are, and picking one lights up its neighbours
 * and sends a spark along each connection.
 *
 * Canvas rather than SVG or WebGL: a few hundred nodes is trivial for 2D, it
 * needs no new dependency, and it adds no second WebGL context to a page that
 * already runs the ambient backdrop. It only repaints while something is
 * moving (the intro, a pan, a selection's sparks) and is idle otherwise.
 */
export function BrainWeb({
  graph,
  positions,
  selectedId,
  highlight,
  now,
  onSelect,
}: {
  graph: BrainGraph;
  positions: Float32Array;
  selectedId: string | null;
  /** Ids a search lit up; null when nothing is being searched. */
  highlight: Set<string> | null;
  now: number;
  onSelect: (id: string | null) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const view = useRef<View>({ zoom: 1, x: 0, y: 0 });
  const target = useRef<{ x: number; y: number } | null>(null);
  const size = useRef({ w: 0, h: 0, dpr: 1 });
  const hover = useRef(-1);
  const introAt = useRef(0);
  const frame = useRef(0);
  const reduced = useRef(false);
  const resized = useRef(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ moved: boolean; sx: number; sy: number; vx: number; vy: number; pinch: number; pz: number } | null>(null);

  // Latest props, read inside the draw loop without re-creating it.
  const live = useRef({ graph, positions, selectedId, highlight, now });
  live.current = { graph, positions, selectedId, highlight, now };

  const [tip, setTip] = useState<{ i: number; x: number; y: number } | null>(null);

  const baseRadius = () => Math.min(size.current.w, size.current.h) * 0.44;
  /** Dots shrink on a small canvas so a phone isn't a pile of overlapping circles. */
  const dotScale = () => clamp(Math.min(size.current.w, size.current.h) / 640, 0.6, 1) * (0.85 + 0.15 * Math.min(view.current.zoom, 2));

  const toScreen = useCallback((i: number, spread = 1) => {
    const { positions: p } = live.current;
    const R = baseRadius();
    const v = view.current;
    return {
      x: size.current.w / 2 + v.x + p[i * 2] * R * v.zoom * spread,
      y: size.current.h / 2 + v.y + p[i * 2 + 1] * R * v.zoom * spread,
    };
  }, []);

  const hit = useCallback(
    (px: number, py: number): number => {
      const { graph: g } = live.current;
      let best = -1;
      let bestD = Infinity;
      for (let i = 0; i < g.nodes.length; i++) {
        const s = toScreen(i);
        const r = g.nodes[i].radius * dotScale() + 6;
        const d = (s.x - px) ** 2 + (s.y - py) ** 2;
        if (d <= r * r && d < bestD) {
          best = i;
          bestD = d;
        }
      }
      return best;
    },
    [toScreen],
  );

  const draw = useCallback(
    (t: number): boolean => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return false;
      const { graph: g, selectedId: sel, highlight: lit, now: nowMs } = live.current;
      const { w, h, dpr } = size.current;
      if (!w || !h) return false;

      let again = false;

      // Ease the pan toward a selected node.
      const tg = target.current;
      if (tg) {
        const v = view.current;
        if (reduced.current) {
          v.x = tg.x;
          v.y = tg.y;
          target.current = null;
        } else {
          v.x += (tg.x - v.x) * 0.18;
          v.y += (tg.y - v.y) * 0.18;
          if (Math.abs(tg.x - v.x) < 0.4 && Math.abs(tg.y - v.y) < 0.4) {
            v.x = tg.x;
            v.y = tg.y;
            target.current = null;
          } else again = true;
        }
      }

      const intro = reduced.current ? 1 : clamp((t - introAt.current) / INTRO_MS, 0, 1);
      if (intro < 1) again = true;
      const ease = 1 - (1 - intro) ** 3;
      const spread = 0.3 + 0.7 * ease;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const selIdx = sel ? (g.index.get(sel) ?? -1) : -1;
      const focus = hover.current >= 0 ? hover.current : selIdx;
      const focusSet = new Set<number>();
      if (focus >= 0) {
        focusSet.add(focus);
        for (const l of g.links) {
          if (l.a === focus) focusSet.add(l.b);
          else if (l.b === focus) focusSet.add(l.a);
        }
      }
      const isLit = (i: number) => !lit || lit.has(g.nodes[i].id) || g.nodes[i].hub;

      const pos = g.nodes.map((_, i) => toScreen(i, spread));

      // links
      ctx.lineCap = "round";
      for (const l of g.links) {
        const a = pos[l.a];
        const b = pos[l.b];
        let alpha = l.hub ? 0.17 : 0.2 + 0.24 * l.weight;
        const touchesFocus = focus >= 0 && (l.a === focus || l.b === focus);
        if (touchesFocus) alpha = 0.55;
        else if (focus >= 0) alpha *= 0.5;
        if (lit && !(isLit(l.a) && isLit(l.b))) alpha *= 0.15;
        ctx.strokeStyle = touchesFocus
          ? kindColor(g.nodes[focus].kind, alpha * intro, 70)
          : `hsla(150, 25%, 80%, ${alpha * intro})`;
        ctx.lineWidth = touchesFocus ? 1.6 : l.hub ? 0.9 : 0.8 + l.weight * 0.7;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }

      // sparks travelling out of the selected memory along its links
      if (selIdx >= 0 && !reduced.current) {
        again = true;
        const phase = (t / 1600) % 1;
        ctx.fillStyle = kindColor(g.nodes[selIdx].kind, 0.95, 78);
        g.links.forEach((l, k) => {
          if (l.a !== selIdx && l.b !== selIdx) return;
          const from = pos[selIdx];
          const to = pos[l.a === selIdx ? l.b : l.a];
          const u = (phase + (k % 5) * 0.2) % 1;
          ctx.globalAlpha = Math.sin(u * Math.PI);
          ctx.beginPath();
          ctx.arc(from.x + (to.x - from.x) * u, from.y + (to.y - from.y) * u, 2, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.globalAlpha = 1;
      }

      // nodes: hubs underneath, the focused one on top
      const order = g.nodes.map((_, i) => i).sort((a, b) => Number(g.nodes[b].hub) - Number(g.nodes[a].hub) || Number(a === focus) - Number(b === focus));
      const zr = dotScale();
      let labels = 0;
      const labelQueue: { i: number; x: number; y: number; r: number; strong: boolean }[] = [];

      for (const i of order) {
        const n = g.nodes[i];
        const s = pos[i];
        if (s.x < -30 || s.y < -30 || s.x > w + 30 || s.y > h + 30) continue;
        const r = n.radius * zr * (0.4 + 0.6 * ease);

        let alpha = 1;
        if (!n.hub) {
          const age = n.at == null ? 0.4 * FADE_DAYS : Math.max(0, (nowMs - n.at) / DAY_MS);
          alpha = clamp(1 - (age / FADE_DAYS) * 0.62, 0.38, 1);
        }
        if (lit && !isLit(i)) alpha *= 0.14;
        else if (focus >= 0 && !focusSet.has(i)) alpha *= 0.45;
        const emphasised = i === focus || (lit && lit.has(n.id));
        // What you searched for or picked shouldn't be dimmed by age — a ten-year-old
        // match is exactly what you came for.
        if (emphasised && !n.hub) alpha = Math.max(alpha, 0.92);
        alpha *= ease;

        if (emphasised) {
          const glow = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r * 4.2);
          glow.addColorStop(0, kindColor(n.kind, 0.45 * ease, 62));
          glow.addColorStop(1, kindColor(n.kind, 0, 62));
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(s.x, s.y, r * 4.2, 0, Math.PI * 2);
          ctx.fill();
        }

        if (n.hub) {
          ctx.fillStyle = `hsla(270, 40%, 30%, ${0.55 * alpha})`;
          ctx.strokeStyle = `hsla(270, 60%, 76%, ${0.85 * alpha})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        } else {
          ctx.fillStyle = kindColor(n.kind, alpha, emphasised ? 74 : 64);
          ctx.beginPath();
          ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
          ctx.fill();
        }

        if (i === selIdx) {
          ctx.strokeStyle = `hsla(150, 30%, 96%, ${0.95 * ease})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(s.x, s.y, r + 4, 0, Math.PI * 2);
          ctx.stroke();
        }

        const strong = n.hub || i === focus || !!(lit && lit.has(n.id));
        if (strong || (view.current.zoom > 1.8 && labels < 60)) {
          if (!strong) labels++;
          labelQueue.push({ i, x: s.x, y: s.y, r, strong });
        }
      }

      // labels last, so no node paints over a title
      ctx.font = "600 12px Inter, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      let strongShown = 0;
      for (const q of labelQueue) {
        if (q.strong && !g.nodes[q.i].hub && q.i !== focus && strongShown++ > 14) continue;
        const text = g.nodes[q.i].title.length > 34 ? `${g.nodes[q.i].title.slice(0, 33)}…` : g.nodes[q.i].title;
        const y = q.y + q.r + 5;
        ctx.lineWidth = 3;
        ctx.strokeStyle = `rgba(8, 14, 12, ${0.85 * ease})`;
        ctx.strokeText(text, q.x, y);
        ctx.fillStyle = q.strong ? `hsla(150, 20%, 94%, ${0.95 * ease})` : `hsla(150, 12%, 78%, ${0.8 * ease})`;
        ctx.fillText(text, q.x, y);
      }

      return again;
    },
    [toScreen],
  );

  const request = useCallback(() => {
    if (frame.current) return;
    frame.current = requestAnimationFrame((t) => {
      frame.current = 0;
      if (draw(t)) request();
    });
  }, [draw]);

  /** Scale and centre the web so it fills the canvas, whatever its shape. */
  const fitView = useCallback(() => {
    const { positions: p, graph: g } = live.current;
    const { w, h } = size.current;
    const n = g.nodes.length;
    if (!w || !h || n === 0) {
      view.current = { zoom: 1, x: 0, y: 0 };
      return;
    }
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < n; i++) {
      minX = Math.min(minX, p[i * 2]);
      maxX = Math.max(maxX, p[i * 2]);
      minY = Math.min(minY, p[i * 2 + 1]);
      maxY = Math.max(maxY, p[i * 2 + 1]);
    }
    const R = baseRadius();
    // Room around the edge for the biggest node and its label.
    const bw = Math.max((maxX - minX) * R, 1);
    const bh = Math.max((maxY - minY) * R, 1);
    const zoom = clamp(Math.min((w - 110) / bw, (h - 110) / bh), 0.6, 2.6);
    view.current = {
      zoom,
      x: -((minX + maxX) / 2) * R * zoom,
      y: -((minY + maxY) / 2) * R * zoom,
    };
  }, []);

  // size + reduced-motion
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reduced.current = mq.matches;
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const fit = () => {
      const r = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      size.current = { w: r.width, h: r.height, dpr };
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      canvas.style.width = `${r.width}px`;
      canvas.style.height = `${r.height}px`;
      if (resized.current) fitView();
      resized.current = true;
      request();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    return () => {
      ro.disconnect();
      if (frame.current) cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, [request, fitView]);

  // a new web plays the settle-in again, fitted to the canvas
  useEffect(() => {
    introAt.current = performance.now();
    fitView();
    target.current = null;
    hover.current = -1;
    setTip(null);
    request();
  }, [graph, positions, request, fitView]);

  // glide to a newly picked memory
  useEffect(() => {
    if (selectedId) {
      const i = graph.index.get(selectedId);
      if (i != null && size.current.w) {
        const R = baseRadius();
        const v = view.current;
        target.current = { x: -positions[i * 2] * R * v.zoom, y: -positions[i * 2 + 1] * R * v.zoom };
      }
    }
    request();
  }, [selectedId, graph, positions, request]);

  // repaint when what's lit up changes — without dragging the view back to the selection
  useEffect(() => {
    request();
  }, [highlight, now, request]);

  // wheel zoom needs a non-passive listener to stop the page scrolling
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = wrap.getBoundingClientRect();
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, Math.exp(-e.deltaY * 0.0015));
    };
    wrap.addEventListener("wheel", onWheel, { passive: false });
    return () => wrap.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function zoomAt(px: number, py: number, factor: number) {
    const v = view.current;
    const next = clamp(v.zoom * factor, MIN_ZOOM, MAX_ZOOM);
    const k = next / v.zoom;
    const cx = size.current.w / 2;
    const cy = size.current.h / 2;
    // keep the point under the cursor where it is
    v.x = px - cx - (px - cx - v.x) * k;
    v.y = py - cy - (py - cy - v.y) * k;
    v.zoom = next;
    target.current = null;
    request();
  }

  function local(e: React.PointerEvent) {
    const r = wrapRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function onPointerDown(e: React.PointerEvent) {
    try {
      // Keeps a drag going when the pointer leaves the canvas. Can throw for a
      // pointer the browser doesn't consider active; the gesture works without it.
      wrapRef.current?.setPointerCapture(e.pointerId);
    } catch {
      /* not capturable — carry on */
    }
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    const v = view.current;
    if (pointers.current.size === 1) {
      gesture.current = { moved: false, sx: p.x, sy: p.y, vx: v.x, vy: v.y, pinch: 0, pz: v.zoom };
    } else if (pointers.current.size === 2 && gesture.current) {
      const [a, b] = [...pointers.current.values()];
      gesture.current.pinch = Math.hypot(a.x - b.x, a.y - b.y);
      gesture.current.pz = v.zoom;
      gesture.current.moved = true;
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const p = local(e);
    const g = gesture.current;
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, p);

    if (g && pointers.current.size === 2 && g.pinch > 0) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, (g.pz * (d / g.pinch)) / view.current.zoom);
      return;
    }
    if (g && pointers.current.size === 1) {
      if (!g.moved && Math.hypot(p.x - g.sx, p.y - g.sy) > 4) g.moved = true;
      if (g.moved) {
        view.current.x = g.vx + (p.x - g.sx);
        view.current.y = g.vy + (p.y - g.sy);
        target.current = null;
        request();
        return;
      }
    }
    if (e.pointerType === "mouse" && !g) {
      const i = hit(p.x, p.y);
      if (i !== hover.current) {
        hover.current = i;
        setTip(i >= 0 ? { i, x: p.x, y: p.y } : null);
        request();
      } else if (i >= 0) setTip({ i, x: p.x, y: p.y });
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    const p = local(e);
    const g = gesture.current;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) {
      if (g && !g.moved) {
        const i = hit(p.x, p.y);
        onSelect(i >= 0 ? live.current.graph.nodes[i].id : null);
      }
      gesture.current = null;
    } else if (pointers.current.size === 1 && g) {
      const [rest] = [...pointers.current.values()];
      g.sx = rest.x;
      g.sy = rest.y;
      g.vx = view.current.x;
      g.vy = view.current.y;
      g.pinch = 0;
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const step = 48;
    const v = view.current;
    if (e.key === "ArrowLeft") v.x += step;
    else if (e.key === "ArrowRight") v.x -= step;
    else if (e.key === "ArrowUp") v.y += step;
    else if (e.key === "ArrowDown") v.y -= step;
    else if (e.key === "+" || e.key === "=") zoomAt(size.current.w / 2, size.current.h / 2, 1.25);
    else if (e.key === "-") zoomAt(size.current.w / 2, size.current.h / 2, 0.8);
    else if (e.key === "0") reset();
    else if (e.key === "Escape") onSelect(null);
    else return;
    e.preventDefault();
    target.current = null;
    request();
  }

  function reset() {
    fitView();
    target.current = null;
    request();
  }

  const tipNode = tip ? graph.nodes[tip.i] : null;

  return (
    <div
      ref={wrapRef}
      tabIndex={0}
      role="application"
      aria-label={`Web of ${graph.nodes.length} memories. Drag to pan, scroll or pinch to zoom, click a memory to read it. The Timeline view lists the same memories as plain text.`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={() => {
        if (hover.current !== -1) {
          hover.current = -1;
          setTip(null);
          request();
        }
      }}
      onKeyDown={onKeyDown}
      className="relative h-full w-full touch-none select-none overflow-hidden rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      style={{ cursor: tip ? "pointer" : "grab" }}
    >
      <canvas ref={canvasRef} className="absolute inset-0" aria-hidden />

      {tipNode && tip && (
        <div
          className="pointer-events-none absolute z-10 max-w-[240px] rounded-lg border border-white/10 bg-background/90 px-2.5 py-1.5 text-xs shadow-lg backdrop-blur-md"
          style={{ left: Math.min(tip.x + 14, size.current.w - 250), top: Math.max(8, tip.y - 12) }}
        >
          <p className="font-medium leading-snug">{tipNode.title}</p>
          {!tipNode.hub && <p className="mt-0.5 text-muted-foreground">{ageLabel(tipNode.at, now)}</p>}
        </div>
      )}

      <div className="absolute bottom-3 right-3 flex flex-col gap-1.5">
        {[
          { label: "Zoom in", icon: ZoomIn, run: () => zoomAt(size.current.w / 2, size.current.h / 2, 1.3) },
          { label: "Zoom out", icon: ZoomOut, run: () => zoomAt(size.current.w / 2, size.current.h / 2, 1 / 1.3) },
          { label: "Reset view", icon: Maximize2, run: reset },
        ].map(({ label, icon: Icon, run }) => (
          <button
            key={label}
            type="button"
            aria-label={label}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={run}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-background/70 text-muted-foreground backdrop-blur-xl transition-colors hover:border-primary/40 hover:text-foreground"
          >
            <Icon className="h-4 w-4" />
          </button>
        ))}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { getQualityTier } from "@/lib/scene/use-scene-capability";
import {
  mixHue,
  planetDaylight,
  planetLayout,
  RIBBON_FLARE,
  RIBBON_KNEE,
  RIBBON_PATH,
  ribbonX,
  ROCKS_BACK,
  ROCKS_FRONT,
  ROCKS_MIN_HALF_WIDTH,
  type NebulaMood,
  type NebulaPhase,
} from "@/lib/scene/nebula";
import {
  flareFrag,
  flareVert,
  motesFrag,
  motesVert,
  quadVert,
  ribbonFrag,
  ribbonVert,
  rocksFrag,
  rocksVert,
  skyFrag,
} from "./nebula-shaders";

const MAX_RIPPLES = 4;
const MAX_PULSES = 6;
/** Ribbon lengths per second a tap's pulse travels. */
const PULSE_SPEED = 0.45;
/** The Core charges for this long before it bursts (core-portal's T.charge). */
const BOOM_DELAY = 0.22;
const SAMPLES = 240;
const MIN_DPR = 0.6;
/** Parallax depth per layer, in world units at full pointer deflection. */
const DEPTH = { ribbons: 0.025, motes: 0.07 };

/** hsl → rgb in 0–1, the way CSS reads `hsl()` (same as ambient-root.tsx). */
function hsl(h: number, s: number, l: number, out = new THREE.Color()) {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return out.setRGB(f(0), f(8), f(4));
}

type Uniforms = ReturnType<typeof createUniforms>;

/** One set of uniform objects, shared by reference across every layer's material. */
function createUniforms() {
  return {
    uTime: { value: 0 },
    uSpeed: { value: 1 },
    uAspect: { value: 1 },
    uHue: { value: 152 },
    uBright: { value: 1 },
    uGlow: { value: 1 },
    uFlash: { value: 0 },
    uDay: { value: planetDaylight(new Date()) },
    uPx: { value: 0.001 },
    uDpr: { value: 1 },
    uCursor: { value: 0 },
    uPar: { value: new THREE.Vector2() },
    uPointer: { value: new THREE.Vector2(0, 0.15) },
    uPlanet: { value: new THREE.Vector3(0.6, 0.53, 0.42) },
    uRipples: { value: Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(0, 0, -1, 0)) },
    uPulses: { value: Array.from({ length: MAX_PULSES }, () => new THREE.Vector2(0, -1)) },
    uPulseSpeed: { value: PULSE_SPEED },
    uKnee: { value: 0.2 },
    uFlare: { value: 0.9 },
    uColor: { value: new THREE.Color() },
    uHot: { value: new THREE.Color() },
    uMote: { value: new THREE.Color() },
  };
}

interface RibbonPath {
  pts: THREE.Vector2[];
  normals: THREE.Vector2[];
  kneeS: number;
  flareS: number;
}

/** Mutable per-frame state — written by listeners and the Driver, never React state. */
interface Live {
  time: number;
  aspect: number;
  fine: boolean;
  par: THREE.Vector2;
  parTarget: THREE.Vector2;
  pointer: THREE.Vector2;
  pointerTarget: THREE.Vector2;
  cursor: number;
  cursorTarget: number;
  touchUntil: number;
  hue: number;
  accentHue: number;
  bright: number;
  speed: number;
  flashAt: number;
  dayAt: number;
  ripple: number;
  pulse: number;
  path: RibbonPath | null;
}

function buildPath(aspect: number): RibbonPath {
  const curve = new THREE.CatmullRomCurve3(
    RIBBON_PATH.map(([u, y]) => new THREE.Vector3(ribbonX(u, aspect), y, 0)),
    false,
    "centripetal",
  );
  const pts = curve.getSpacedPoints(SAMPLES - 1).map((p) => new THREE.Vector2(p.x, p.y));
  const normals = pts.map((_, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const t = b.clone().sub(a).normalize();
    return new THREE.Vector2(-t.y, t.x);
  });
  const nearest = (x: number, y: number) => nearestSample(pts, x, y) / (SAMPLES - 1);
  return {
    pts,
    normals,
    kneeS: nearest(ribbonX(RIBBON_KNEE[0], aspect), RIBBON_KNEE[1]),
    flareS: nearest(ribbonX(RIBBON_FLARE[0], aspect), RIBBON_FLARE[1]),
  };
}

function nearestSample(pts: THREE.Vector2[], x: number, y: number) {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const d = (pts[i].x - x) ** 2 + (pts[i].y - y) ** 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

/** A flat strip along the path; the vertex shader widens, twists and bends it. */
function strandGeometry(path: RibbonPath, offset: (s: number) => number) {
  const n = path.pts.length;
  const position = new Float32Array(n * 2 * 3);
  const aS = new Float32Array(n * 2);
  const aSide = new Float32Array(n * 2);
  const aNormal = new Float32Array(n * 2 * 2);
  for (let i = 0; i < n; i++) {
    const s = i / (n - 1);
    const p = path.pts[i];
    const nm = path.normals[i];
    const o = offset(s);
    for (let side = 0; side < 2; side++) {
      const j = i * 2 + side;
      position[j * 3] = p.x + nm.x * o;
      position[j * 3 + 1] = p.y + nm.y * o;
      aS[j] = s;
      aSide[j] = side ? 1 : -1;
      aNormal[j * 2] = nm.x;
      aNormal[j * 2 + 1] = nm.y;
    }
  }
  const index: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const a = i * 2;
    index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(position, 3));
  g.setAttribute("aS", new THREE.BufferAttribute(aS, 1));
  g.setAttribute("aSide", new THREE.BufferAttribute(aSide, 1));
  g.setAttribute("aNormal", new THREE.BufferAttribute(aNormal, 2));
  g.setIndex(index);
  return g;
}

/** The main ribbon plus two fainter sheets drifting beside it. */
const STRANDS = [
  { halfW: 0.028, alpha: 1, core: 1, phase: 0, pull: 1, offset: () => 0 },
  {
    halfW: 0.05,
    alpha: 0.4,
    core: 0.35,
    phase: 1.9,
    pull: 0.8,
    offset: (s: number) => 0.01 + 0.008 * Math.sin(s * Math.PI * 2.3 + 0.6),
  },
  {
    halfW: 0.07,
    alpha: 0.22,
    core: 0.15,
    phase: 4.1,
    pull: 0.6,
    offset: (s: number) => -0.012 - 0.008 * Math.sin(s * Math.PI * 1.7),
  },
];

/** Taps on controls, links and cards belong to the UI, not the sky. */
function isInteractive(target: EventTarget | null) {
  return (
    target instanceof Element &&
    !!target.closest(
      'a,button,input,textarea,select,label,summary,[role="button"],[role="dialog"],[role="menu"],[contenteditable="true"],.card-surface',
    )
  );
}

/**
 * The Dashboard's live backdrop: a flowing nebula with a slowly turning
 * planet, light ribbons and rim-lit rocks (layout in lib/scene/nebula.ts).
 * Layers shift with the cursor at different depths, the cursor lights the
 * clouds, taps send a pulse along the ribbons, and the Core's detonation
 * flares the whole sky.
 */
export default function NebulaRoot({
  mood,
  phase,
  onReady,
  onFail,
}: {
  mood: NebulaMood;
  phase: NebulaPhase;
  onReady: () => void;
  onFail: () => void;
}) {
  const tier = useMemo(() => getQualityTier(), []);
  const maxDpr = tier === "low" ? 1 : 1.25;
  const [dpr, setDpr] = useState(() => Math.min(window.devicePixelRatio || 1, maxDpr));
  const [visible, setVisible] = useState(() => !document.hidden);
  const u = useMemo(createUniforms, []);
  const live = useMemo<Live>(
    () => ({
      time: 0,
      aspect: window.innerWidth / Math.max(1, window.innerHeight),
      fine: window.matchMedia("(pointer: fine)").matches,
      par: new THREE.Vector2(),
      parTarget: new THREE.Vector2(),
      pointer: new THREE.Vector2(0, 0.15),
      pointerTarget: new THREE.Vector2(0, 0.15),
      cursor: 0,
      cursorTarget: 0,
      touchUntil: 0,
      hue: mood.hue,
      accentHue: mood.accentHue,
      bright: mood.brightness,
      speed: mood.speed,
      flashAt: -1,
      dayAt: 0,
      ripple: 0,
      pulse: 0,
      path: null,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const moodRef = useRef(mood);
  moodRef.current = mood;
  const callbacks = useRef({ onReady, onFail });
  callbacks.current = { onReady, onFail };

  useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Pointer: parallax + cursor light on mice; taps (any pointer) send pulses.
  useEffect(() => {
    const toWorld = (x: number, y: number, out: THREE.Vector2) =>
      out.set((x / window.innerWidth - 0.5) * live.aspect, 0.5 - y / window.innerHeight);
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
      live.parTarget.set((e.clientX / window.innerWidth) * 2 - 1, 1 - (e.clientY / window.innerHeight) * 2);
      toWorld(e.clientX, e.clientY, live.pointerTarget);
      live.cursorTarget = 1;
    };
    const onOut = (e: PointerEvent) => {
      if (e.relatedTarget) return;
      live.cursorTarget = 0;
      live.parTarget.set(0, 0);
    };
    let down: { x: number; y: number; at: number } | null = null;
    const onDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY, at: performance.now() };
      if (e.pointerType === "touch") {
        toWorld(e.clientX, e.clientY, live.pointerTarget);
        live.pointer.copy(live.pointerTarget);
        live.cursorTarget = 0.8;
        live.touchUntil = live.time + 1.6;
      }
    };
    const onUp = (e: PointerEvent) => {
      const d = down;
      down = null;
      if (!d || isInteractive(e.target)) return;
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 10 || performance.now() - d.at > 600) return;
      const at = toWorld(e.clientX, e.clientY, new THREE.Vector2());
      spawnRipple(u, live, at, live.time, 1);
      spawnPulse(u, live, at, live.time);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerout", onOut);
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerout", onOut);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
    };
  }, [live, u]);

  // The Core detonating flares the sky and sends a ring + pulse out from it.
  useEffect(() => {
    if (phase !== "boom") return;
    const at = live.time + BOOM_DELAY;
    live.flashAt = at;
    const centre = new THREE.Vector2(0, 0);
    spawnRipple(u, live, centre, at, 1.6);
    spawnPulse(u, live, centre, at);
  }, [phase, live, u]);

  return (
    <Canvas
      orthographic
      camera={{ position: [0, 0, 10], near: 0.1, far: 100, zoom: 1 }}
      dpr={dpr}
      frameloop={!visible ? "never" : phase === "console" ? "demand" : "always"}
      gl={{ antialias: false, alpha: false, depth: false, stencil: false }}
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      onCreated={({ gl }) => gl.setClearColor(0x000000, 1)}
    >
      <Driver u={u} live={live} moodRef={moodRef} />
      <Sky u={u} tier={tier} />
      <Ribbons u={u} live={live} />
      <Rocks u={u} tier={tier} />
      <Motes u={u} live={live} tier={tier} />
      <ConsoleTicker active={visible && phase === "console"} />
      <Health
        dpr={dpr}
        setDpr={setDpr}
        paused={!visible || phase === "console"}
        callbacks={callbacks}
      />
    </Canvas>
  );
}

function spawnRipple(u: Uniforms, live: Live, at: THREE.Vector2, start: number, strength: number) {
  u.uRipples.value[live.ripple].set(at.x, at.y, start, strength);
  live.ripple = (live.ripple + 1) % MAX_RIPPLES;
}

function spawnPulse(u: Uniforms, live: Live, at: THREE.Vector2, start: number) {
  const path = live.path;
  if (!path) return;
  // the ribbons sit parallax-shifted from their stored centreline
  const ox = -live.par.x * DEPTH.ribbons;
  const oy = -live.par.y * DEPTH.ribbons;
  const s = nearestSample(path.pts, at.x - ox, at.y - oy) / (SAMPLES - 1);
  u.uPulses.value[live.pulse].set(s, start);
  live.pulse = (live.pulse + 1) % MAX_PULSES;
}

/** Eases everything toward its target once per frame and feeds the uniforms. */
function Driver({
  u,
  live,
  moodRef,
}: {
  u: Uniforms;
  live: Live;
  moodRef: MutableRefObject<NebulaMood>;
}) {
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);
  const camera = useThree((s) => s.camera);

  useEffect(() => {
    const aspect = size.width / Math.max(1, size.height);
    live.aspect = aspect;
    u.uAspect.value = aspect;
    u.uPx.value = 1 / Math.max(1, size.height * dpr);
    u.uDpr.value = dpr;
    const pl = planetLayout(aspect);
    u.uPlanet.value.set(pl.x, pl.y, pl.r);
    // one world unit = the viewport's height
    camera.zoom = size.height;
    camera.updateProjectionMatrix();
  }, [size, dpr, camera, live, u]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const L = live;
    L.time += dt;
    const ease = (k: number) => 1 - Math.exp(-k * dt);

    if (!L.fine) {
      // no hover on touch screens — a slow drift keeps the depth alive
      L.parTarget.set(Math.sin(L.time * 0.07) * 0.6, Math.sin(L.time * 0.05 + 1.3) * 0.35);
      if (L.time > L.touchUntil) L.cursorTarget = 0;
    }
    L.par.lerp(L.parTarget, ease(2.2));
    L.pointer.lerp(L.pointerTarget, ease(6));
    L.cursor += (L.cursorTarget - L.cursor) * ease(3);

    const m = moodRef.current;
    L.hue = mixHue(L.hue, m.hue, ease(1.1));
    L.accentHue = mixHue(L.accentHue, m.accentHue, ease(1.1));
    L.bright += (m.brightness - L.bright) * ease(1.5);
    L.speed += (m.speed - L.speed) * ease(1);

    const ft = L.time - L.flashAt;
    const flash = L.flashAt < 0 || ft < 0 ? 0 : Math.min(1, ft * 12) * Math.exp(-ft * 2.2);

    u.uTime.value = L.time;
    u.uSpeed.value = L.speed;
    u.uHue.value = L.hue;
    u.uBright.value = L.bright;
    u.uGlow.value = L.bright * (1 + flash * 1.5);
    u.uFlash.value = flash;
    u.uCursor.value = L.cursor;
    u.uPar.value.copy(L.par);
    u.uPointer.value.copy(L.pointer);
    hsl(L.accentHue, 0.75, 0.5, u.uColor.value);
    hsl(L.accentHue + 10, 0.6, 0.85, u.uHot.value);
    hsl(L.hue + 8, 0.7, 0.62, u.uMote.value);

    for (const r of u.uRipples.value) if (r.z >= 0 && L.time - r.z > 4) r.z = -1;
    for (const p of u.uPulses.value) if (p.y >= 0 && L.time - p.y > 5) p.y = -1;

    if (L.time - L.dayAt > 30) {
      u.uDay.value = planetDaylight(new Date());
      L.dayAt = L.time;
    }
  });

  return null;
}

function Sky({ u, tier }: { u: Uniforms; tier: "low" | "high" }) {
  const geometry = useMemo(() => new THREE.PlaneGeometry(2, 2), []);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: quadVert,
        fragmentShader: skyFrag,
        defines: {
          OCT: tier === "low" ? 4 : 5,
          OCT_R: tier === "low" ? 3 : 4,
          CRATERS: tier === "low" ? 1 : 2,
        },
        uniforms: {
          uTime: u.uTime,
          uFlow: u.uSpeed,
          uAspect: u.uAspect,
          uHue: u.uHue,
          uBright: u.uBright,
          uFlash: u.uFlash,
          uDay: u.uDay,
          uPx: u.uPx,
          uCursor: u.uCursor,
          uPar: u.uPar,
          uPointer: u.uPointer,
          uPlanet: u.uPlanet,
          uRipples: u.uRipples,
        },
        depthTest: false,
        depthWrite: false,
      }),
    [u, tier],
  );
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );
  return <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={0} />;
}

function Ribbons({ u, live }: { u: Uniforms; live: Live }) {
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height));
  const key = Math.round(aspect * 100) / 100;
  const path = useMemo(() => buildPath(key), [key]);
  const group = useRef<THREE.Group>(null);

  useEffect(() => {
    live.path = path;
    u.uKnee.value = path.kneeS;
    u.uFlare.value = path.flareS;
  }, [path, live, u]);

  const strands = useMemo(
    () =>
      STRANDS.map((cfg) => ({
        geometry: strandGeometry(path, cfg.offset),
        material: new THREE.ShaderMaterial({
          vertexShader: ribbonVert,
          fragmentShader: ribbonFrag,
          uniforms: {
            uTime: u.uTime,
            uSpeed: u.uSpeed,
            uBright: u.uGlow,
            uCursor: u.uCursor,
            uPointer: u.uPointer,
            uKnee: u.uKnee,
            uFlare: u.uFlare,
            uPulseSpeed: u.uPulseSpeed,
            uPulses: u.uPulses,
            uColor: u.uColor,
            uHot: u.uHot,
            uHalfW: { value: cfg.halfW },
            uAlpha: { value: cfg.alpha },
            uCore: { value: cfg.core },
            uPhase: { value: cfg.phase },
            uPull: { value: cfg.pull },
          },
          transparent: true,
          depthTest: false,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      })),
    [path, u],
  );
  useEffect(
    () => () =>
      strands.forEach((s) => {
        s.geometry.dispose();
        s.material.dispose();
      }),
    [strands],
  );

  const flareGeo = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  const flareMat = () =>
    new THREE.ShaderMaterial({
      vertexShader: flareVert,
      fragmentShader: flareFrag,
      uniforms: { uIntensity: { value: 0 }, uColor: u.uColor, uHot: u.uHot },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
  const [kneeMat] = useState(flareMat);
  const [endMat] = useState(flareMat);
  useEffect(
    () => () => {
      flareGeo.dispose();
      kneeMat.dispose();
      endMat.dispose();
    },
    [flareGeo, kneeMat, endMat],
  );

  useFrame(() => {
    group.current?.position.set(-u.uPar.value.x * DEPTH.ribbons, -u.uPar.value.y * DEPTH.ribbons, 0);
    const t = u.uTime.value;
    // a pulse front crossing a flare makes it flash
    const boost = (s: number) => {
      let b = 0;
      for (const p of u.uPulses.value) {
        if (p.y < 0 || t < p.y) continue;
        const age = t - p.y;
        const front = Math.abs(Math.abs(s - p.x) - age * PULSE_SPEED);
        b += Math.exp(-(front * front) / 0.0009) * Math.exp(-age * 0.9);
      }
      return b;
    };
    const g = u.uGlow.value;
    kneeMat.uniforms.uIntensity.value = (0.45 + 0.2 * Math.sin(t * 0.7) + boost(path.kneeS) * 1.2) * g;
    endMat.uniforms.uIntensity.value = (0.6 + 0.25 * Math.sin(t * 0.55 + 2) + boost(path.flareS) * 1.4) * g;
  });

  const knee = path.pts[Math.round(path.kneeS * (SAMPLES - 1))];
  const end = path.pts[Math.round(path.flareS * (SAMPLES - 1))];

  return (
    <group ref={group}>
      {strands.map((s, i) => (
        <mesh key={i} geometry={s.geometry} material={s.material} frustumCulled={false} renderOrder={1} />
      ))}
      <mesh
        geometry={flareGeo}
        material={kneeMat}
        position={[knee.x, knee.y, 0]}
        scale={0.42}
        frustumCulled={false}
        renderOrder={2}
      />
      <mesh
        geometry={flareGeo}
        material={endMat}
        position={[end.x, end.y, 0]}
        scale={0.7}
        frustumCulled={false}
        renderOrder={2}
      />
    </group>
  );
}

function Rocks({ u, tier }: { u: Uniforms; tier: "low" | "high" }) {
  const geometry = useMemo(() => new THREE.PlaneGeometry(2, 2), []);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: rocksVert,
        fragmentShader: rocksFrag,
        defines: { OCT: tier === "low" ? 3 : 4 },
        uniforms: {
          uTime: u.uTime,
          uAspect: u.uAspect,
          uHue: u.uHue,
          uBright: u.uBright,
          uPx: u.uPx,
          uCursor: u.uCursor,
          uPar: u.uPar,
          uPointer: u.uPointer,
          uBack: { value: ROCKS_BACK },
          uFront: { value: ROCKS_FRONT },
          uMinHalf: { value: ROCKS_MIN_HALF_WIDTH },
        },
        transparent: true,
        premultipliedAlpha: true,
        depthTest: false,
        depthWrite: false,
      }),
    [u, tier],
  );
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );
  return <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={3} />;
}

function Motes({ u, live, tier }: { u: Uniforms; live: Live; tier: "low" | "high" }) {
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height));
  const half = Math.round((aspect / 2) * 20) / 20;
  const group = useRef<THREE.Group>(null);
  const geometry = useMemo(() => {
    const count = Math.round((tier === "low" ? 40 : 80) * Math.min(1.3, Math.max(0.35, half / 0.9)));
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      pos.set([(Math.random() * 2 - 1) * (half + 0.08), Math.random() * 1.1 - 0.55, 0], i * 3);
      seed.set(
        [Math.random() * Math.PI * 2, 0.4 + Math.random() * 0.9, 1.5 + Math.random() * 2.5, 0.5 + Math.random() * 1.8],
        i * 4,
      );
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 4));
    return g;
  }, [half, tier]);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: motesVert,
        fragmentShader: motesFrag,
        uniforms: {
          uTime: u.uTime,
          uDpr: u.uDpr,
          uPointer: u.uPointer,
          uColor: u.uMote,
          uBright: u.uGlow,
        },
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [u],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  useFrame(() => {
    group.current?.position.set(-live.par.x * DEPTH.motes, -live.par.y * DEPTH.motes, 0);
  });

  return (
    <group ref={group}>
      <points geometry={geometry} material={material} frustumCulled={false} renderOrder={4} />
    </group>
  );
}

/** Behind the console the sky only needs to drift — 24fps on demand is plenty. */
function ConsoleTicker({ active }: { active: boolean }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => invalidate(), 1000 / 24);
    return () => window.clearInterval(id);
  }, [active, invalidate]);
  return null;
}

/**
 * Signals ready after the first frames, steps resolution down when frames
 * drop (the sky is soft, so it holds up well), and only gives up — handing
 * back to the static image — if it's still too slow at the lowest step. Also
 * gives up on a genuine WebGL context loss.
 */
function Health({
  dpr,
  setDpr,
  paused,
  callbacks,
}: {
  dpr: number;
  setDpr: (d: number) => void;
  paused: boolean;
  callbacks: MutableRefObject<{ onReady: () => void; onFail: () => void }>;
}) {
  const gl = useThree((s) => s.gl);
  const frames = useRef(0);
  const win = useRef({ start: 0, count: 0, grace: true, slow: 0 });

  useEffect(() => {
    const el = gl.domElement;
    const onLost = (e: Event) => {
      e.preventDefault();
      if (document.contains(el)) callbacks.current.onFail();
    };
    el.addEventListener("webglcontextlost", onLost);
    // a GPU/driver that rejects one of the shaders gets the still, not a broken layer
    gl.debug.onShaderError = (ctx, program) => {
      console.warn("[nebula] shader failed to compile:", ctx.getProgramInfoLog(program));
      callbacks.current.onFail();
    };
    return () => {
      el.removeEventListener("webglcontextlost", onLost);
      gl.debug.onShaderError = null;
    };
  }, [gl, callbacks]);

  // any change of conditions starts a fresh measuring window
  useEffect(() => {
    win.current = { start: performance.now(), count: 0, grace: true, slow: win.current.slow };
  }, [dpr, paused]);

  useFrame(() => {
    if (frames.current < 3 && ++frames.current === 3) callbacks.current.onReady();
    if (paused) return;
    const w = win.current;
    const now = performance.now();
    w.count++;
    const span = now - w.start;
    if (span < 2000) return;
    const fps = (w.count * 1000) / span;
    w.start = now;
    w.count = 0;
    if (w.grace) {
      w.grace = false; // the first window includes shader compile
      return;
    }
    if (fps < 45 && dpr > MIN_DPR + 0.01) {
      setDpr(Math.max(MIN_DPR, +(dpr - 0.2).toFixed(2)));
    } else if (fps < 26) {
      if (++w.slow >= 2) callbacks.current.onFail();
    } else {
      w.slow = 0;
    }
  });

  return null;
}

"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { sceneStore } from "@/lib/scene/scene-store";

/** Latest pointer position in viewport px, shared by every orb. Written by SceneRoot. */
export const pointer = { x: -1e4, y: -1e4, fine: false };

// Sizes are in units of the glass sphere's radius; the whole orb is scaled
// to the anchor each frame.
const HALO = 2.6; // glow plane half-size
const PARTICLES = 220;

// Matches the CSS Core: the orb proper is ~half the anchor box, and the CSS
// rings/bloom reach well beyond it.
const RADIUS_OF_BOX = { orbit: 0.25, hero: 0.27 } as const;

/** hsl → rgb in 0–1, the same way CSS reads `hsl()` (no colour management). */
function hsl(h: number, s: number, l: number, out = new THREE.Vector3()) {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return out.set(f(0), f(8), f(4));
}

// Every material composites the same way: rgb is light the orb emits, alpha is
// how much of what's behind it the glass hides. `ONE, ONE_MINUS_SRC_ALPHA`
// = emission + partial transmission, which is what reads as lit glass.
const blending = {
  blending: THREE.CustomBlending,
  blendEquation: THREE.AddEquation,
  blendSrc: THREE.OneFactor,
  blendDst: THREE.OneMinusSrcAlphaFactor,
  blendSrcAlpha: THREE.OneFactor,
  blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  transparent: true,
  depthWrite: false,
  depthTest: false,
} as const;

const NOISE = /* glsl */ `
  float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float vnoise(vec3 x) {
    vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < 3; i++) { v += a * vnoise(p); p = p * 2.03 + 11.7; a *= 0.5; } return v; }
`;

const SHARED_UNIFORMS = `
  uniform float uTime; uniform float uOpacity; uniform float uBright; uniform float uEnergy;
  uniform float uHover; uniform float uActive; uniform vec3 uColor; uniform vec3 uMint; uniform vec2 uLight;
`;

/* -------------------------------- glass -------------------------------- */

const glassVert = /* glsl */ `
  varying vec3 vN; varying vec3 vObj;
  void main() {
    vN = normalize(normalMatrix * normal);
    vObj = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const glassFrag = /* glsl */ `
  ${SHARED_UNIFORMS}
  varying vec3 vN; varying vec3 vObj;
  ${NOISE}
  void main() {
    vec3 N = normalize(vN);
    float ndv = clamp(N.z, 0.0, 1.0);          // orthographic: view dir is +z
    float fres = pow(1.0 - ndv, 2.4);

    // energy suspended inside the glass — two drifting noise fields; thicker
    // (brighter) toward the centre where the eye looks through more of it.
    float speed = 0.18 + uEnergy * 0.42;
    float n1 = fbm(vObj * 1.7 + vec3(0.0, uTime * speed, uTime * speed * 0.7));
    float n2 = fbm(vObj * 3.3 - vec3(uTime * speed * 1.3, 0.0, uTime * speed * 0.6));
    float swirl = smoothstep(0.42 - uEnergy * 0.12, 0.92, n1 * 0.62 + n2 * 0.48);
    float core = pow(ndv, 3.2);
    float energy = (swirl * (0.42 + uEnergy * 0.55) + core * 0.6) * ndv * (0.55 + 0.45 * uActive);
    vec3 inner = mix(uColor, uMint, smoothstep(0.3, 0.8, n2)) * energy * (1.15 + uHover * 0.45);

    // glass: a bright rim, a key highlight that leans toward the pointer, a
    // soft fill, and a faint reflected horizon band.
    vec3 rim = mix(uColor * 1.25, vec3(0.92, 1.0, 0.97), 0.42) * fres * (0.75 + uHover * 0.25);
    vec3 L = normalize(vec3(uLight, 0.8));
    vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
    float nh = max(dot(N, H), 0.0);
    float spec = pow(nh, 110.0) * 1.15 + pow(nh, 16.0) * 0.07;
    vec3 L2 = normalize(vec3(-uLight * 0.8, 0.5));
    float fill = pow(max(dot(N, normalize(L2 + vec3(0.0, 0.0, 1.0))), 0.0), 40.0) * 0.18;
    float band = smoothstep(0.035, 0.0, abs(N.y + N.x * 0.18 - 0.28)) * fres * 0.28;

    vec3 color = (inner + rim + vec3(spec + fill) + band * vec3(0.8, 1.0, 0.93)) * uBright;
    float alpha = clamp(0.08 + fres * 0.7 + energy * 0.55 + spec, 0.0, 1.0);
    gl_FragColor = vec4(color, alpha) * uOpacity;
  }
`;

/* -------------------------------- halo --------------------------------- */

const haloVert = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

const haloFrag = /* glsl */ `
  ${SHARED_UNIFORMS}
  varying vec2 vUv;
  void main() {
    float d = length(vUv * 2.0 - 1.0) * ${HALO.toFixed(2)};   // in sphere radii
    float glow = exp(-pow(max(d - 0.85, 0.0) * 1.35, 2.0)) * smoothstep(${HALO.toFixed(2)}, 1.2, d);
    float breathe = 0.88 + 0.12 * sin(uTime * 1.25);
    float k = glow * breathe * (0.32 + uEnergy * 0.18 + uHover * 0.14) * (0.45 + 0.55 * uActive) * uBright;
    gl_FragColor = vec4(uColor * k, k * 0.35) * uOpacity;
  }
`;

/* ------------------------------ particles ------------------------------ */

const particleVert = /* glsl */ `
  uniform float uTime; uniform float uEnergy; uniform float uPx;
  attribute vec4 aSeed;   // radius, phase, speed, size
  varying float vFade;
  void main() {
    float t = uTime * (0.25 + uEnergy * 0.5) * aSeed.z;
    float a = aSeed.y + t;
    float y = position.y + sin(t * 1.7 + aSeed.y) * 0.08;
    vec3 p = vec3(cos(a) * aSeed.x, y, sin(a) * aSeed.x);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vFade = 0.45 + 0.55 * smoothstep(-1.0, 1.0, p.z);   // nearer = brighter (depth)
    gl_PointSize = aSeed.w * uPx;
    gl_Position = projectionMatrix * mv;
  }
`;

const particleFrag = /* glsl */ `
  ${SHARED_UNIFORMS}
  varying float vFade;
  void main() {
    float r = length(gl_PointCoord * 2.0 - 1.0);
    float k = smoothstep(1.0, 0.0, r);
    k *= k * vFade * (0.55 + uEnergy * 0.45) * uActive * uBright;
    gl_FragColor = vec4(mix(uColor, uMint, 0.4) * k * 1.4, k * 0.5) * uOpacity;
  }
`;

/* -------------------------------- rings -------------------------------- */

const ringVert = /* glsl */ `
  varying vec3 vP;
  void main() { vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

const ringFrag = /* glsl */ `
  ${SHARED_UNIFORMS}
  uniform float uDash; uniform float uDir;
  varying vec3 vP;
  void main() {
    float ang = atan(vP.y, vP.x) / 6.2831853 + 0.5;
    // conic energy sweep (the CSS Core's spinning gradient ring), or a dashed hairline
    float sweep = smoothstep(0.55, 1.0, fract(ang - uTime * 0.11 * uDir));
    float dash = step(0.5, fract(ang * 72.0)) * 0.22;
    float k = mix(sweep, dash, uDash) * uActive * uBright;
    vec3 c = mix(mix(uColor, uMint, 0.35), vec3(0.85, 1.0, 0.95), uDash);
    gl_FragColor = vec4(c * k, k * 0.4) * uOpacity;
  }
`;

/* ---------------------------------------------------------------------- */

const tmpColor = new THREE.Vector3();
const MINT = hsl(168, 0.7, 0.55);

/**
 * One glass Core, drawn over the DOM anchor registered under `id`. Every frame
 * it copies the anchor's on-screen box, opacity and brightness — so the CSS
 * transitions and keyframes CorePortal already runs (orbit slide, charge,
 * burst, reform) drive it directly, reduced-motion timings included.
 */
export function CoreOrb({ id }: { id: string }) {
  const group = useRef<THREE.Group>(null);
  const tilt = useRef<THREE.Group>(null);
  const live = useRef({
    hue: -1,
    energy: 0.45,
    hover: 0,
    active: 0,
    appear: 0,
    tx: 0,
    ty: 0,
    time: Math.random() * 50,
  });

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uBright: { value: 1 },
      uEnergy: { value: 0.45 },
      uHover: { value: 0 },
      uActive: { value: 0 },
      uColor: { value: new THREE.Vector3() },
      uMint: { value: MINT.clone() },
      uLight: { value: new THREE.Vector2(-0.45, 0.55) },
      uPx: { value: 1 },
    }),
    [],
  );

  const materials = useMemo(() => {
    const make = (vertexShader: string, fragmentShader: string, extra: Record<string, { value: number }> = {}) =>
      new THREE.ShaderMaterial({ uniforms: { ...uniforms, ...extra }, vertexShader, fragmentShader, ...blending });
    return {
      glass: make(glassVert, glassFrag),
      halo: make(haloVert, haloFrag),
      particles: make(particleVert, particleFrag),
      sweep: make(ringVert, ringFrag, { uDash: { value: 0 }, uDir: { value: 1 } }),
      dashed: make(ringVert, ringFrag, { uDash: { value: 1 }, uDir: { value: -1 } }),
    };
  }, [uniforms]);

  const particleGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(PARTICLES * 3);
    const seed = new Float32Array(PARTICLES * 4);
    for (let i = 0; i < PARTICLES; i++) {
      // most drift inside the glass; a few orbit just outside it
      const outside = i % 9 === 0;
      const r = outside ? 1.15 + Math.random() * 0.4 : Math.cbrt(Math.random()) * 0.88;
      pos[i * 3 + 1] = (Math.random() * 2 - 1) * (outside ? 0.25 : Math.sqrt(Math.max(0, 0.8 - r * r)));
      seed.set([r, Math.random() * Math.PI * 2, 0.4 + Math.random() * 0.9, outside ? 2.2 : 1 + Math.random() * 1.6], i * 4);
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 4));
    return g;
  }, []);

  // R3F doesn't own objects passed in as props — free the GPU copies ourselves.
  useEffect(
    () => () => {
      Object.values(materials).forEach((m) => m.dispose());
      particleGeo.dispose();
    },
    [materials, particleGeo],
  );

  useFrame((state, dt) => {
    const g = group.current;
    const el = sceneStore.getScene().els.get(id);
    if (!g || !el || !el.isConnected) {
      if (g) g.visible = false;
      return;
    }
    const look = sceneStore.lookOf(id);
    const box = el.getBoundingClientRect();
    const canvas = state.gl.domElement.getBoundingClientRect();
    const css = getComputedStyle(el);
    const opacity = parseFloat(css.opacity) || 0;
    const bright = Number(/brightness\(([\d.]+)\)/.exec(css.filter)?.[1] ?? 1);
    if (opacity < 0.01 || box.width < 2) {
      g.visible = false;
      return;
    }
    g.visible = true;

    const L = live.current;
    const ease = (k: number) => 1 - Math.exp(-k * Math.min(dt, 0.1));

    // where the anchor is, in canvas-centred px
    const cx = box.left + box.width / 2 - canvas.left;
    const cy = box.top + box.height / 2 - canvas.top;
    const radius = box.width * RADIUS_OF_BOX[look.kind];

    // pointer → parallax tilt, light direction, hover
    const dx = pointer.x - (box.left + box.width / 2);
    const dy = pointer.y - (box.top + box.height / 2);
    const near = pointer.fine && look.active && Math.hypot(dx, dy) < radius * 1.25;
    const vw = Math.max(1, canvas.width);
    const vh = Math.max(1, canvas.height);
    const px = pointer.fine ? THREE.MathUtils.clamp((pointer.x - canvas.left) / vw - 0.5, -0.5, 0.5) : 0;
    const py = pointer.fine ? THREE.MathUtils.clamp((pointer.y - canvas.top) / vh - 0.5, -0.5, 0.5) : 0;
    L.tx += (px - L.tx) * ease(6);
    L.ty += (py - L.ty) * ease(6);
    L.hover += ((near ? 1 : 0) - L.hover) * ease(near ? 10 : 5);
    L.active += ((look.active ? 1 : 0) - L.active) * ease(5);
    L.energy += (look.energy - L.energy) * ease(2);
    // no CSS Core covers the load any more, so the glass one fades in itself
    L.appear += (1 - L.appear) * ease(3.5);
    // hue eases the short way round the wheel
    if (L.hue < 0) L.hue = look.hue;
    const dh = ((look.hue - L.hue + 540) % 360) - 180;
    L.hue = (L.hue + dh * ease(3) + 360) % 360;
    L.time += dt;

    const scale = radius * (1 + L.hover * 0.04);
    g.position.set(cx - canvas.width / 2 + L.tx * 10, canvas.height / 2 - cy - L.ty * 10, look.active ? 10 : 0);
    g.scale.setScalar(scale);
    if (tilt.current) {
      // same reach as the CSS Core's rotateX/Y(±12–14°)
      tilt.current.rotation.set(L.ty * 0.42, L.tx * 0.5, 0);
    }

    const u = uniforms;
    u.uTime.value = L.time;
    u.uOpacity.value = opacity * L.appear;
    u.uBright.value = bright;
    u.uEnergy.value = L.energy;
    u.uHover.value = L.hover;
    u.uActive.value = L.active;
    u.uColor.value.copy(hsl(L.hue, 0.82, 0.56, tmpColor));
    u.uLight.value.set(-0.45 + L.tx * 0.7, 0.55 - L.ty * 0.7);
    u.uPx.value = Math.max(1, scale * 0.022) * state.viewport.dpr;
  });

  return (
    <group ref={group} visible={false}>
      <mesh material={materials.halo} renderOrder={0}>
        <planeGeometry args={[HALO * 2, HALO * 2]} />
      </mesh>
      <group ref={tilt}>
        <mesh material={materials.dashed} rotation={[1.25, 0, 0.3]} renderOrder={1}>
          <torusGeometry args={[1.62, 0.006, 6, 160]} />
        </mesh>
        <mesh material={materials.sweep} rotation={[1.4, 0.2, -0.4]} renderOrder={1}>
          <torusGeometry args={[1.34, 0.012, 6, 160]} />
        </mesh>
        <points geometry={particleGeo} material={materials.particles} renderOrder={2} />
        <mesh material={materials.glass} renderOrder={3}>
          <sphereGeometry args={[1, 64, 48]} />
        </mesh>
      </group>
    </group>
  );
}

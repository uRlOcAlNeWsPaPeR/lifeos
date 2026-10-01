"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { RouteMood } from "@/lib/scene/route-mood";
import { getQualityTier } from "@/lib/scene/use-scene-capability";

const LOW_COUNT = 70;
const HIGH_COUNT = 150;
const SHAPE_COUNT = 6;

/** hsl → rgb in 0–1, the same way CSS reads `hsl()` (mirrors core-orb.tsx). */
function hsl(h: number, s: number, l: number, out = new THREE.Color()) {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return out.setRGB(f(0), f(8), f(4));
}

/**
 * Where each particle rests and how far it wanders from that rest point.
 * `scatter`/`grid` give it a small local wobble; `orbit` sends most particles
 * on a real orbit around the origin instead.
 */
function buildLayout(variant: RouteMood["variant"], count: number) {
  const anchors = new Float32Array(count * 3);
  const seeds = new Float32Array(count * 4); // radius, phase, speed, size
  const grid = Math.ceil(Math.cbrt(count));
  for (let i = 0; i < count; i++) {
    let ax = 0;
    let ay = 0;
    let az = 0;
    let radius = 0.1 + Math.random() * 0.2;
    if (variant === "grid") {
      const gx = i % grid;
      const gy = Math.floor(i / grid) % grid;
      const gz = Math.floor(i / (grid * grid));
      ax = (gx / grid - 0.5) * 15 + (Math.random() - 0.5) * 0.9;
      ay = (gy / grid - 0.5) * 9 + (Math.random() - 0.5) * 0.9;
      az = (gz / grid - 0.5) * 6 - 2 + (Math.random() - 0.5) * 0.9;
    } else if (variant === "orbit" && i % 3 !== 0) {
      radius = 1.3 + Math.random() * 3.4;
      ay = (Math.random() - 0.5) * 3;
    } else {
      ax = (Math.random() - 0.5) * 17;
      ay = (Math.random() - 0.5) * 10;
      az = (Math.random() - 0.5) * 7 - 2;
    }
    anchors.set([ax, ay, az], i * 3);
    seeds.set(
      [radius, Math.random() * Math.PI * 2, 0.3 + Math.random() * 0.7, 1.3 + Math.random() * 2.2],
      i * 4,
    );
  }
  return { anchors, seeds };
}

const vert = /* glsl */ `
  uniform float uTime; uniform float uSpeed; uniform float uPx;
  attribute vec3 aAnchor; attribute vec4 aSeed; // radius, phase, speed, size
  varying float vFade;
  void main() {
    float t = uTime * uSpeed * aSeed.z;
    float angle = aSeed.y + t;
    vec3 p = aAnchor + vec3(cos(angle) * aSeed.x, sin(t * 0.6 + aSeed.y) * aSeed.x * 0.4, sin(angle) * aSeed.x);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vFade = clamp(smoothstep(-9.0, 1.0, -mv.z) , 0.0, 1.0);
    gl_PointSize = aSeed.w * uPx;
    gl_Position = projectionMatrix * mv;
  }
`;

const frag = /* glsl */ `
  uniform vec3 uColor; uniform float uOpacity;
  varying float vFade;
  void main() {
    float r = length(gl_PointCoord * 2.0 - 1.0);
    float k = smoothstep(1.0, 0.0, r);
    k *= k * vFade;
    gl_FragColor = vec4(uColor, 1.0) * k * uOpacity;
  }
`;

/**
 * The persistent full-viewport canvas: a drifting particle field plus a
 * handful of large, barely-visible floating shapes. Mood (hue/speed/opacity/
 * layout) changes smoothly as the route changes — see Field and Shapes.
 */
export default function AmbientRoot({ mood }: { mood: RouteMood }) {
  const tier = useMemo(() => getQualityTier(), []);
  const count = tier === "low" ? LOW_COUNT : HIGH_COUNT;
  const [visible, setVisible] = useState(() => typeof document === "undefined" || !document.hidden);

  useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  return (
    <Canvas
      camera={{ position: [0, 0, 7], fov: 45, near: 0.1, far: 40 }}
      dpr={[1, 1.5]}
      frameloop={visible ? "always" : "never"}
      gl={{ alpha: true, antialias: false, powerPreference: "low-power" }}
      style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: -8 }}
    >
      <Field mood={mood} count={count} />
      <Shapes mood={mood} />
    </Canvas>
  );
}

/** The instanced (one draw call) particle field. */
function Field({ mood, count }: { mood: RouteMood; count: number }) {
  const groupRef = useRef<THREE.Group>(null);
  const variantRef = useRef(mood.variant);
  const live = useRef({ hue: mood.hue, speed: mood.speed, time: Math.random() * 50, px: 0, py: 0 });

  const geometry = useMemo(() => {
    const { anchors, seeds } = buildLayout(mood.variant, count);
    const g = new THREE.BufferGeometry();
    // Points requires a `position` attribute to set the draw count, even
    // though the vertex shader computes the real position from aAnchor/aSeed.
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    g.setAttribute("aAnchor", new THREE.BufferAttribute(anchors, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 4));
    return g;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uSpeed: { value: mood.speed },
          uPx: { value: 1 },
          uColor: { value: hsl(mood.hue, 0.55, 0.62) },
          uOpacity: { value: 0 }, // fades in on mount instead of popping
        },
        vertexShader: vert,
        fragmentShader: frag,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);

  // A new layout (variant change) is cheap enough to rebuild in place —
  // regenerating the Points object itself on every route would be wasteful.
  useEffect(() => {
    if (variantRef.current === mood.variant) return;
    variantRef.current = mood.variant;
    const { anchors, seeds } = buildLayout(mood.variant, count);
    const aAnchor = geometry.getAttribute("aAnchor") as THREE.BufferAttribute;
    const aSeed = geometry.getAttribute("aSeed") as THREE.BufferAttribute;
    (aAnchor.array as Float32Array).set(anchors);
    (aSeed.array as Float32Array).set(seeds);
    aAnchor.needsUpdate = true;
    aSeed.needsUpdate = true;
  }, [mood.variant, geometry, count]);

  // Subtle cursor parallax — a local, lightweight listener (not the Dashboard
  // Core's `pointer`, which is a different, orb-anchor-specific concern).
  useEffect(() => {
    if (!window.matchMedia("(pointer: fine)").matches) return;
    const onMove = (e: PointerEvent) => {
      live.current.px = (e.clientX / window.innerWidth) * 2 - 1;
      live.current.py = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  useFrame((state, dt) => {
    const L = live.current;
    const ease = (k: number) => 1 - Math.exp(-k * Math.min(dt, 0.1));
    L.time += dt;
    L.speed += (mood.speed - L.speed) * ease(1.2);

    const u = material.uniforms;
    u.uTime.value = L.time;
    u.uSpeed.value = L.speed;
    u.uOpacity.value += (mood.opacity - u.uOpacity.value) * ease(1.2);
    u.uPx.value = state.viewport.dpr * 55;

    // hue eases the short way round the wheel
    const dh = ((mood.hue - L.hue + 540) % 360) - 180;
    L.hue = (L.hue + dh * ease(1.0) + 360) % 360;
    hsl(L.hue, 0.55, 0.62, u.uColor.value as THREE.Color);

    if (groupRef.current) {
      const targetY = L.px * 0.12;
      const targetX = -L.py * 0.08;
      groupRef.current.rotation.y += (targetY - groupRef.current.rotation.y) * ease(1.5);
      groupRef.current.rotation.x += (targetX - groupRef.current.rotation.x) * ease(1.5);
    }
  });

  return (
    <group ref={groupRef}>
      <points geometry={geometry} material={material} />
    </group>
  );
}

/** A handful of large, barely-visible floating shapes — too few to need instancing. */
function Shapes({ mood }: { mood: RouteMood }) {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const color = useRef(hsl(mood.hue, 0.45, 0.5));
  const opacity = useRef(0);

  const seeds = useMemo(
    () =>
      Array.from({ length: SHAPE_COUNT }, () => ({
        pos: new THREE.Vector3(
          (Math.random() - 0.5) * 15,
          (Math.random() - 0.5) * 9,
          -3 - Math.random() * 5,
        ),
        speed: 0.05 + Math.random() * 0.08,
        phase: Math.random() * Math.PI * 2,
        scale: 0.9 + Math.random() * 1.7,
      })),
    [],
  );

  useFrame((state, dt) => {
    const ease = (k: number) => 1 - Math.exp(-k * Math.min(dt, 0.1));
    opacity.current += (mood.opacity * 0.4 - opacity.current) * ease(1.2);
    color.current.lerp(hsl(mood.hue, 0.45, 0.5), ease(1.0));

    refs.current.forEach((mesh, i) => {
      if (!mesh) return;
      const s = seeds[i];
      mesh.rotation.x += dt * s.speed;
      mesh.rotation.y += dt * s.speed * 0.7;
      mesh.position.y = s.pos.y + Math.sin(state.clock.elapsedTime * s.speed + s.phase) * 0.4;
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = opacity.current;
      mat.color.copy(color.current);
    });
  });

  return (
    <>
      {seeds.map((s, i) => (
        <mesh
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          position={s.pos}
          scale={s.scale}
        >
          <icosahedronGeometry args={[1, 0]} />
          <meshBasicMaterial transparent opacity={0} wireframe depthWrite={false} depthTest />
        </mesh>
      ))}
    </>
  );
}

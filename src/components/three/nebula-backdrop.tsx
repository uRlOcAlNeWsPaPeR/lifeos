"use client";

import { Component, useEffect, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { useSceneCapability } from "@/lib/scene/use-scene-capability";
import { nebulaMood, type NebulaInput } from "@/lib/scene/nebula";

// three/R3F behind a lazy chunk, same as the Core: only fetched on a device
// that passes the capability check.
const NebulaRoot = dynamic(() => import("./nebula-root"), { ssr: false, loading: () => null });

const STILL = "url(/backdrop/nebula.webp)";

/**
 * The Dashboard's backdrop. Capable devices get the live nebula, faded in
 * once it's drawing; reduced motion, no WebGL, the `?core3d=off` opt-out, or
 * a scene that fails or can't keep up all get the still image it's modelled on.
 * `onLiveChange` reports whether the live scene is the one on screen.
 */
export function NebulaBackdrop({
  input,
  onLiveChange,
}: {
  input: NebulaInput;
  onLiveChange?: (live: boolean) => void;
}) {
  const cap = useSceneCapability();
  // the capability check only exists on the client — render nothing but the
  // base colour until after hydration so server and client markup agree
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const attempt = mounted && !!cap?.ok && !failed;
  const live = attempt && ready;

  useEffect(() => {
    onLiveChange?.(live);
  }, [live, onLiveChange]);

  const dim = input.phase === "console";

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-20 overflow-hidden bg-background">
      {mounted && cap && !attempt && (
        <div
          className="absolute inset-0 bg-cover bg-center transition-opacity duration-700"
          style={{ backgroundImage: STILL, opacity: dim ? 0.55 : 1 }}
        />
      )}
      {attempt && (
        <NebulaErrorBoundary onError={() => setFailed(true)}>
          <div
            className="absolute inset-0 transition-opacity duration-[1400ms] ease-out"
            style={{ opacity: ready ? 1 : 0 }}
          >
            <NebulaRoot
              mood={nebulaMood(input)}
              phase={input.phase}
              onReady={() => setReady(true)}
              onFail={() => setFailed(true)}
            />
          </div>
        </NebulaErrorBoundary>
      )}
    </div>
  );
}

// Its own boundary — a backdrop crash must never touch the Core's sceneStore.
class NebulaErrorBoundary extends Component<
  { children: ReactNode; onError: () => void },
  { broken: boolean }
> {
  state = { broken: false };

  static getDerivedStateFromError() {
    return { broken: true };
  }

  componentDidCatch(error: unknown) {
    console.warn("[nebula] live backdrop failed, using the still:", error);
    this.props.onError();
  }

  render() {
    return this.state.broken ? null : this.props.children;
  }
}

"use client";

import dynamic from "next/dynamic";

// `ssr: false` dynamic() calls aren't allowed inside a Server Component file
// (the root layout) — this one-line client wrapper is what lets the actual
// capability check skip the server render entirely instead of mismatching it.
// Same pattern as ambient-scene-loader.tsx.
export const PersistentNebula = dynamic(
  () => import("./persistent-nebula").then((m) => m.PersistentNebula),
  { ssr: false },
);

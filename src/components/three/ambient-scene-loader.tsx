"use client";

import dynamic from "next/dynamic";

// `ssr: false` dynamic() calls aren't allowed inside a Server Component file
// (the root layout) — this one-line client wrapper is what lets the actual
// capability check skip the server render entirely instead of mismatching it.
export const AmbientScene = dynamic(
  () => import("./ambient-scene").then((m) => m.AmbientScene),
  { ssr: false },
);

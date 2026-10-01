"use client";

import { useEffect } from "react";
import { holdAmbientDim } from "@/lib/scene/ambient-dim";

/** Quiets the ambient backdrop while mounted (see lib/scene/ambient-dim.ts). */
export function AmbientDimmer() {
  useEffect(() => holdAmbientDim(), []);
  return null;
}

"use client";

import { usePathname } from "next/navigation";

/**
 * Ambient app background: a few large, heavily-blurred green gradient shapes
 * sitting partially off-screen. Fixed behind all content, non-interactive.
 * Suppressed on the homepage, which uses its own cinematic scene instead.
 */
export function BackgroundFX() {
  const pathname = usePathname();
  // "/" and "/dashboard" run their own cinematic atmosphere.
  if (pathname === "/" || pathname === "/dashboard") return null;

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-background" />

      <div
        className="absolute -left-[22%] -top-[28%] h-[75vh] w-[75vh] rounded-full blur-2xl opacity-[0.4] [will-change:transform] animate-[aurora-drift_26s_ease-in-out_infinite] motion-reduce:animate-none"
        style={{
          background: "radial-gradient(circle at 40% 40%, hsl(152 70% 42% / 0.3), transparent 62%)",
        }}
      />
      <div
        className="absolute -right-[18%] top-[4%] h-[62vh] w-[62vh] rounded-full blur-2xl opacity-[0.36] [will-change:transform] animate-[aurora-drift_30s_ease-in-out_infinite_reverse] motion-reduce:animate-none"
        style={{
          background: "radial-gradient(circle at 55% 45%, hsl(168 72% 40% / 0.24), transparent 60%)",
        }}
      />
      <div
        className="absolute bottom-[-30%] left-[26%] h-[58vh] w-[58vh] rounded-full blur-2xl opacity-[0.3] [will-change:transform] animate-[aurora-drift_34s_ease-in-out_infinite] motion-reduce:animate-none"
        style={{
          background: "radial-gradient(circle at 50% 50%, hsl(140 65% 44% / 0.18), transparent 62%)",
        }}
      />

      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-background to-transparent" />
    </div>
  );
}

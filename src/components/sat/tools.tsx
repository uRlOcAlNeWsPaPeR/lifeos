"use client";

import { useEffect, useRef, useState } from "react";
import { Calculator, ExternalLink, FileText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DESMOS_URL } from "@/lib/sat/constants";
import { cn } from "@/lib/utils";

/**
 * A floating panel the student can drag by its header on desktop; on phones it
 * docks as a bottom sheet (there's nowhere useful to drag it). Used for the
 * Desmos calculator and the reference sheet, as on the real test.
 */
function FloatingPanel({
  title,
  icon: Icon,
  onClose,
  headerExtra,
  className,
  children,
}: {
  title: string;
  icon: typeof Calculator;
  onClose: () => void;
  headerExtra?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  function onPointerDown(e: React.PointerEvent) {
    if ((e.target as HTMLElement).closest("button, a") || innerWidth <= 640) return;
    const rect = panelRef.current!.getBoundingClientRect();
    drag.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current || !panelRef.current) return;
    const pad = 8;
    const maxLeft = innerWidth - panelRef.current.offsetWidth - pad;
    const maxTop = innerHeight - panelRef.current.offsetHeight - pad;
    setPos({
      left: Math.max(pad, Math.min(maxLeft, e.clientX - drag.current.dx)),
      top: Math.max(pad, Math.min(maxTop, e.clientY - drag.current.dy)),
    });
  }
  const endDrag = () => {
    drag.current = null;
  };

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label={title}
      style={pos ? { left: pos.left, top: pos.top, right: "auto", bottom: "auto" } : undefined}
      className={cn(
        "fixed inset-x-2 bottom-2 z-[90] flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-popover/95 shadow-glow-lg backdrop-blur-xl animate-scale-in",
        "sm:inset-x-auto sm:bottom-6 sm:right-6",
        className,
      )}
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="flex cursor-grab select-none items-center justify-between gap-2 border-b border-white/[0.07] px-4 py-2.5 active:cursor-grabbing"
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          <Icon className="h-4 w-4 text-primary" />
          {title}
        </span>
        <span className="flex items-center gap-1">
          {headerExtra}
          <Button variant="ghost" size="icon" onClick={onClose} aria-label={`Close ${title}`}>
            <X className="h-4 w-4" />
          </Button>
        </span>
      </div>
      {children}
    </div>
  );
}

export function CalculatorPanel({ onClose }: { onClose: () => void }) {
  return (
    <FloatingPanel
      title="Desmos testing calculator"
      icon={Calculator}
      onClose={onClose}
      className="h-[60vh] sm:h-[520px] sm:w-[440px]"
      headerExtra={
        <a
          href={DESMOS_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open the calculator in a new tab"
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-white/5 hover:text-foreground"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      }
    >
      <iframe src={DESMOS_URL} title="Desmos graphing calculator" className="h-full w-full flex-1 border-0 bg-white" />
    </FloatingPanel>
  );
}

const REFERENCE: [string, string][] = [
  ["Circle", "A = πr² · C = 2πr"],
  ["Rectangle", "A = lw"],
  ["Triangle", "A = ½bh"],
  ["Pythagorean", "a² + b² = c²"],
  ["Special right triangles", "45-45-90: x, x, x√2 · 30-60-90: x, x√3, 2x"],
  ["Volumes", "Box: lwh · Cylinder: πr²h · Sphere: (4/3)πr³ · Cone: (1/3)πr²h · Pyramid: (1/3)lwh"],
  ["Facts", "Circle: 360° = 2π radians · Triangle angles sum to 180°"],
];

export function ReferencePanel({ onClose }: { onClose: () => void }) {
  return (
    <FloatingPanel title="Reference sheet" icon={FileText} onClose={onClose} className="max-h-[70vh] sm:bottom-6 sm:w-[340px] lg:right-[calc(440px+3rem)]">
      <dl className="space-y-2.5 overflow-y-auto p-4 text-sm scrollbar-thin">
        {REFERENCE.map(([k, v]) => (
          <div key={k}>
            <dt className="font-medium">{k}</dt>
            <dd className="text-muted-foreground">{v}</dd>
          </div>
        ))}
      </dl>
    </FloatingPanel>
  );
}

/** Calculator + reference-sheet toggles, shown on math questions only. */
export function MathTools({ show }: { show: boolean }) {
  const [calc, setCalc] = useState(false);
  const [ref, setRef] = useState(false);
  // Moving to a non-math question closes both, as on the real test.
  useEffect(() => {
    if (!show) {
      setCalc(false);
      setRef(false);
    }
  }, [show]);
  if (!show) return null;
  return (
    <>
      <Button variant={calc ? "secondary" : "ghost"} size="icon" onClick={() => setCalc((v) => !v)} aria-pressed={calc} aria-label="Calculator" title="Desmos testing calculator">
        <Calculator className="h-4 w-4" />
      </Button>
      <Button variant={ref ? "secondary" : "ghost"} size="icon" onClick={() => setRef((v) => !v)} aria-pressed={ref} aria-label="Reference sheet" title="Reference sheet">
        <FileText className="h-4 w-4" />
      </Button>
      {calc && <CalculatorPanel onClose={() => setCalc(false)} />}
      {ref && <ReferencePanel onClose={() => setRef(false)} />}
    </>
  );
}

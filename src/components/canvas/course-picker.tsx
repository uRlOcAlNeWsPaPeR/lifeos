"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { useCanvas } from "@/lib/canvas/use-canvas";

/**
 * "Choose which courses sync" modal. Opens automatically right after Canvas is
 * connected, and on demand from Settings → School. Driven entirely by the
 * `useCanvas()` value passed in, so every mount point shares one flow.
 */
export function CanvasCoursePicker({ canvas }: { canvas: ReturnType<typeof useCanvas> }) {
  const { coursePicker, closeCoursePicker, saveCoursePicker } = canvas;
  const { open, loading, saving, courses, selectedIds } = coursePicker;

  const [checked, setChecked] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open || loading) return;
    // default: whatever's already selected, or everything on first run
    setChecked(new Set(selectedIds ?? courses.map((c) => c.canvasCourseId)));
  }, [open, loading, selectedIds, courses]);

  const allIds = courses.map((c) => c.canvasCourseId);
  const allOn = allIds.length > 0 && checked.size === allIds.length;

  const toggle = (id: string) =>
    setChecked((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleSave = () => {
    // "all checked" persists as null so courses added later are picked up too
    void saveCoursePicker(allOn ? null : [...checked]);
  };

  return (
    <Modal
      open={open}
      onClose={closeCoursePicker}
      title="Choose which courses sync"
      description="Only the courses you pick show up in LifeOS. You can change this any time in Settings → School."
    >
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading your Canvas courses…</p>
      ) : courses.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Canvas didn&apos;t return any active courses to choose from.
        </p>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setChecked(allOn ? new Set() : new Set(allIds))}
            className="mb-2 text-xs font-medium text-primary hover:underline"
          >
            {allOn ? "Clear all" : "Select all"}
          </button>
          <ul className="max-h-[46vh] space-y-1 overflow-y-auto scrollbar-thin">
            {courses.map((c) => {
              const on = checked.has(c.canvasCourseId);
              const meta = [c.code, c.term].filter(Boolean).join(" · ");
              return (
                <li key={c.canvasCourseId}>
                  <label
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition-colors",
                      on ? "border-primary bg-primary/10" : "border-white/10 hover:bg-white/5",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggle(c.canvasCourseId)}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                    />
                    <span>
                      <span className="block font-medium">{c.name}</span>
                      {meta && (
                        <span className="block text-xs text-muted-foreground">{meta}</span>
                      )}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <div className="mt-4 flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={closeCoursePicker} disabled={saving}>
          Cancel
        </Button>
        <Button loading={saving} disabled={loading || courses.length === 0} onClick={handleSave}>
          {allOn ? "Sync all courses" : `Sync ${checked.size} course${checked.size === 1 ? "" : "s"}`}
        </Button>
      </div>
    </Modal>
  );
}

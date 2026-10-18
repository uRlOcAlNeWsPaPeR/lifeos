"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Eraser } from "lucide-react";
import { fixMathHTML } from "@/lib/sat/math-fix";
import {
  addHighlight,
  HIGHLIGHT_COLORS,
  overlaps,
  removeRange,
  type Highlight,
  type HighlightColor,
} from "@/lib/sat/highlights";
import { cn } from "@/lib/utils";

/* ----------------------------- text <-> offsets ---------------------------- */

const BLOCKS = new Set(["P", "DIV", "UL", "OL", "LI", "TABLE", "TBODY", "TR", "TD", "TH", "BR", "SECTION", "BLOCKQUOTE"]);

function textNodes(root: HTMLElement): Text[] {
  const out: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) out.push(n as Text);
  return out;
}

/** Characters from the start of the passage's text to a DOM position. */
function offsetOf(root: HTMLElement, node: Node, offset: number): number {
  const r = document.createRange();
  r.selectNodeContents(root);
  r.setEnd(node, offset);
  return r.toString().length;
}

/** The DOM position `offset` characters into the passage's text. */
function locate(root: HTMLElement, offset: number): { node: Text; offset: number } | null {
  let pos = 0;
  let last: Text | null = null;
  for (const n of textNodes(root)) {
    last = n;
    if (offset <= pos + n.data.length) return { node: n, offset: offset - pos };
    pos += n.data.length;
  }
  return last ? { node: last, offset: last.data.length } : null;
}

/**
 * Wrap each highlighted span in <mark>. A highlight may cross elements (bold,
 * italics), so it's wrapped one text node at a time. Text inside math or an
 * image is left alone — a <mark> there would break the markup — but still
 * counts toward the offsets, so everything after it lines up.
 */
function paint(root: HTMLElement, list: Highlight[]) {
  for (const h of list) {
    let pos = 0;
    for (const n of textNodes(root)) {
      const ns = pos;
      pos += n.data.length;
      if (pos <= h.start || ns >= h.end) continue;
      if (n.parentElement?.closest("math, svg, script, style")) continue;
      const a = Math.max(h.start, ns) - ns;
      const b = Math.min(h.end, pos) - ns;
      const piece = n.data.slice(a, b);
      // Blank gaps between paragraphs aren't worth colouring.
      const edge = (s: Node | null) => !s || (s.nodeType === 1 && BLOCKS.has((s as Element).tagName));
      if (!/\S/.test(piece) && (edge(n.previousSibling) || edge(n.nextSibling))) continue;
      const target = a > 0 ? n.splitText(a) : n;
      if (b - a < target.data.length) target.splitText(b - a);
      const mark = document.createElement("mark");
      mark.className = `sat-hl sat-hl-${h.color}`;
      mark.dataset.s = String(h.start);
      mark.dataset.e = String(h.end);
      target.parentNode!.insertBefore(mark, target);
      mark.appendChild(target);
    }
  }
}

const SWATCH: Record<HighlightColor, string> = {
  yellow: "bg-[hsl(48,96%,58%)]",
  blue: "bg-[hsl(205,90%,62%)]",
  pink: "bg-[hsl(330,85%,66%)]",
};

interface Bar {
  top: number;
  left: number;
  start: number;
  end: number;
}

/**
 * A passage you can mark up, like on the real test: select words and a small
 * bar offers yellow, blue or pink; select highlighted words (or click a
 * highlight) and the same bar offers to remove it.
 *
 * Highlights come in and go out as plain offsets (see lib/sat/highlights.ts),
 * so the parent decides how long they live — per question for a practice set,
 * kept across the whole module in an exam.
 */
export function HighlightableHtml({
  html,
  highlights,
  onChange,
}: {
  html: string | undefined;
  highlights: Highlight[];
  onChange: (next: Highlight[]) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [bar, setBar] = useState<Bar | null>(null);

  // Same hand-injected HTML as QuestionHtml (the MathML repairs rewrite nodes,
  // so React must not own them), then the marks on top.
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    el.innerHTML = html ?? "";
    fixMathHTML(el);
    paint(el, highlights);
    setBar(null);
  }, [html, highlights]);

  useEffect(() => {
    const body = () => bodyRef.current;

    const update = () => {
      const sel = window.getSelection();
      const el = body();
      const wrap = wrapRef.current;
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed || !el || !wrap) return setBar(null);
      const r = sel.getRangeAt(0);
      if (!el.contains(r.commonAncestorContainer)) return setBar(null);
      const start = offsetOf(el, r.startContainer, r.startOffset);
      const end = offsetOf(el, r.endContainer, r.endOffset);
      if (end <= start) return setBar(null);

      const rect = r.getBoundingClientRect();
      const box = wrap.getBoundingClientRect();
      const width = 188;
      const above = rect.top - box.top - 46;
      setBar({
        top: above >= 0 ? above : rect.bottom - box.top + 8,
        left: Math.max(0, Math.min(box.width - width, rect.left - box.left + rect.width / 2 - width / 2)),
        start,
        end,
      });
    };

    // A selection is still changing while it's being dragged — wait until it settles.
    let timer = 0;
    const onSelection = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => !dragging.current && update(), 160);
    };
    const onUp = () => {
      dragging.current = false;
      window.clearTimeout(timer);
      timer = window.setTimeout(update, 0);
    };
    document.addEventListener("selectionchange", onSelection);
    document.addEventListener("pointerup", onUp);
    // A touch selection (long-press, then drag the handles) ends in pointercancel,
    // not pointerup — without this the bar would never appear on a phone.
    document.addEventListener("pointercancel", onUp);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("selectionchange", onSelection);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
    };
  }, []);

  function choose(color: HighlightColor) {
    if (!bar) return;
    onChange(addHighlight(highlights, { start: bar.start, end: bar.end, color }));
    window.getSelection()?.removeAllRanges();
    setBar(null);
  }

  function clear() {
    if (!bar) return;
    onChange(removeRange(highlights, bar.start, bar.end));
    window.getSelection()?.removeAllRanges();
    setBar(null);
  }

  // Clicking a highlight selects all of it, which brings up the bar to remove it.
  function onClick(e: React.MouseEvent) {
    const mark = (e.target as HTMLElement).closest?.("mark.sat-hl") as HTMLElement | null;
    const el = bodyRef.current;
    const sel = window.getSelection();
    if (!mark || !el || !sel || !sel.isCollapsed) return;
    const a = locate(el, Number(mark.dataset.s));
    const b = locate(el, Number(mark.dataset.e));
    if (!a || !b) return;
    const range = document.createRange();
    range.setStart(a.node, a.offset);
    range.setEnd(b.node, b.offset);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  const hasHere = bar ? overlaps(highlights, bar.start, bar.end) : false;

  return (
    <div ref={wrapRef} className="relative" onPointerDown={(e) => {
        // Only a mouse drag needs waiting out; a touch selection is handled by the
        // debounce alone (its pointer events stop as soon as the OS takes over).
        dragging.current = e.pointerType === "mouse";
      }} onClick={onClick}>
      <div className="mb-3 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span>Select text to highlight it.</span>
        {highlights.length > 0 && (
          <button type="button" onClick={() => onChange([])} className="rounded-md px-1.5 py-0.5 hover:bg-white/5 hover:text-foreground">
            Clear highlights
          </button>
        )}
      </div>

      <div ref={bodyRef} className="sat-content" />

      {bar && (
        <div
          role="toolbar"
          aria-label="Highlight"
          // Keep the selection alive while a button is pressed.
          onMouseDown={(e) => e.preventDefault()}
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute z-20 flex items-center gap-1 rounded-xl border border-white/15 bg-background/95 p-1.5 shadow-lg backdrop-blur-xl"
          style={{ top: bar.top, left: bar.left }}
        >
          {HIGHLIGHT_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Highlight ${c}`}
              title={`Highlight ${c}`}
              onClick={() => choose(c)}
              className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-white/10"
            >
              <span className={cn("h-4 w-4 rounded-full ring-1 ring-black/20", SWATCH[c])} />
            </button>
          ))}
          {hasHere && (
            <button
              type="button"
              aria-label="Remove highlight"
              title="Remove highlight"
              onClick={clear}
              className="ml-0.5 flex h-7 items-center gap-1 rounded-lg px-2 text-xs text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
            >
              <Eraser className="h-3.5 w-3.5" />
              Remove
            </button>
          )}
        </div>
      )}
    </div>
  );
}

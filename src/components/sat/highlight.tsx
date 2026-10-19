"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Eraser, StickyNote } from "lucide-react";
import { fixMathHTML } from "@/lib/sat/math-fix";
import {
  addHighlight,
  HIGHLIGHT_COLORS,
  highlightAt,
  overlaps,
  removeRange,
  setNote,
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
      mark.className = `sat-hl sat-hl-${h.color}${h.note ? " sat-hl-note" : ""}`;
      if (h.note) {
        mark.dataset.note = h.note;
        mark.title = h.note;
      }
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

interface NoteEditor extends Bar {
  text: string;
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
  compact = false,
  className,
}: {
  html: string | undefined;
  highlights: Highlight[];
  onChange: (next: Highlight[]) => void;
  /** No "select text" hint or Clear button — for a second block next to a passage. */
  compact?: boolean;
  className?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [bar, setBar] = useState<Bar | null>(null);
  const [editor, setEditor] = useState<NoteEditor | null>(null);

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

  // A different question's passage closes any open note.
  useEffect(() => setEditor(null), [html]);

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
      const width = 224;
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

  /** Where the note box goes: under the given rect, kept inside the passage column. */
  function editorSpot(rect: DOMRect) {
    const wrap = wrapRef.current!;
    const box = wrap.getBoundingClientRect();
    const width = Math.min(260, box.width);
    return {
      top: rect.bottom - box.top + 8,
      left: Math.max(0, Math.min(box.width - width, rect.left - box.left + rect.width / 2 - width / 2)),
    };
  }

  function startNote() {
    if (!bar) return;
    const sel = window.getSelection();
    const rect = sel && sel.rangeCount ? sel.getRangeAt(0).getBoundingClientRect() : null;
    const here = highlightAt(highlights, bar.start);
    const exact = here && here.start <= bar.start && here.end >= bar.end;
    if (!exact) {
      onChange(addHighlight(highlights, { start: bar.start, end: bar.end, color: here?.color ?? "yellow", note: "" }));
    }
    setEditor({
      ...(rect ? editorSpot(rect) : { top: bar.top, left: bar.left }),
      start: bar.start,
      end: bar.end,
      text: exact ? here.note ?? "" : "",
    });
    sel?.removeAllRanges();
    setBar(null);
  }

  function saveNote() {
    if (!editor) return;
    onChange(setNote(highlights, editor.start, editor.end, editor.text));
    setEditor(null);
  }

  function removeFromEditor() {
    if (!editor) return;
    onChange(removeRange(highlights, editor.start, editor.end));
    setEditor(null);
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
    // A highlight with a note opens that note (editable); a plain one offers removal.
    if (mark.dataset.note) {
      const start = Number(mark.dataset.s);
      const end = Number(mark.dataset.e);
      setBar(null);
      setEditor({ ...editorSpot(mark.getBoundingClientRect()), start, end, text: mark.dataset.note });
      return;
    }
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
      {!compact && (
        <div className="mb-3 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span>Select text to highlight it or add a note.</span>
          {highlights.length > 0 && (
            <button type="button" onClick={() => onChange([])} className="rounded-md px-1.5 py-0.5 hover:bg-white/5 hover:text-foreground">
              Clear highlights
            </button>
          )}
        </div>
      )}

      <div ref={bodyRef} className={cn("sat-content", className)} />

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
          <button
            type="button"
            aria-label="Add a note"
            title="Add a note"
            onClick={startNote}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
          >
            <StickyNote className="h-4 w-4" />
          </button>
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

      {editor && (
        <div
          role="dialog"
          aria-label="Note"
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute z-30 flex w-[min(260px,100%)] flex-col gap-2 rounded-xl border border-white/15 bg-background/95 p-2.5 shadow-lg backdrop-blur-xl"
          style={{ top: editor.top, left: editor.left }}
        >
          <textarea
            autoFocus
            value={editor.text}
            maxLength={300}
            placeholder="Add a note…"
            onChange={(e) => setEditor({ ...editor, text: e.target.value })}
            className="min-h-[76px] w-full resize-y rounded-lg border border-white/10 bg-white/5 p-2 text-base text-foreground outline-none focus:border-primary/50 sm:text-sm"
          />
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={saveNote}
              className="flex-1 rounded-lg bg-primary/90 px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary"
            >
              Save
            </button>
            <button
              type="button"
              onClick={removeFromEditor}
              className="rounded-lg px-3 py-2 text-xs text-muted-foreground hover:bg-white/10 hover:text-foreground"
            >
              Remove highlight
            </button>
            <button
              type="button"
              onClick={() => setEditor(null)}
              className="rounded-lg px-3 py-2 text-xs text-muted-foreground hover:bg-white/10 hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

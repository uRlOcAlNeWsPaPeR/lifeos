"use client";

import { useMemo, useState } from "react";
import { Sparkles, ClipboardPaste, PencilLine, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { authedApi } from "@/lib/client";
import { toast } from "@/components/ui/toaster";
import { dedupeCards, parsePaste, type ParsedCard } from "@/lib/practice/parse";
import { useAppData } from "@/lib/store/app-data";
import { cn } from "@/lib/utils";

type Tab = "paste" | "ai" | "blank";

const TABS: { id: Tab; label: string; icon: typeof PencilLine }[] = [
  { id: "paste", label: "Paste a list", icon: ClipboardPaste },
  { id: "ai", label: "From notes", icon: Sparkles },
  { id: "blank", label: "Start blank", icon: PencilLine },
];

/**
 * Deck creation. Three ways in, one shared preview: nothing is written until the
 * student can see the cards they're about to get.
 */
export function CreateDeck({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, addDeck } = useAppData();
  const [tab, setTab] = useState<Tab>("paste");
  const [title, setTitle] = useState("");
  const [courseId, setCourseId] = useState("");
  const [pasted, setPasted] = useState("");
  const [notes, setNotes] = useState("");
  const [generated, setGenerated] = useState<ParsedCard[] | null>(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  const atLimit =
    data.limits.maxDecks !== null && data.decks.length >= data.limits.maxDecks;

  // The paste tab previews live as you type; the AI tab previews what came back.
  const preview = useMemo<ParsedCard[]>(() => {
    if (tab === "paste") return dedupeCards(parsePaste(pasted));
    if (tab === "ai") return generated ?? [];
    return [];
  }, [tab, pasted, generated]);

  function reset() {
    setTab("paste"); setTitle(""); setCourseId(""); setPasted("");
    setNotes(""); setGenerated(null); setGenerating(false); setSaving(false);
  }

  function close() {
    reset();
    onClose();
  }

  async function generate() {
    if (notes.trim().length < 40) {
      toast("Paste a bit more of your notes so there's something to work from.", "error");
      return;
    }
    setGenerating(true);
    try {
      const res = await authedApi<{ cards: ParsedCard[]; engine: string }>(
        "/api/practice/generate",
        { method: "POST", body: { notes, title: title.trim() || null } },
      );
      const cards = dedupeCards(res.cards ?? []);
      setGenerated(cards);
      if (!cards.length) {
        toast("Couldn't find anything to turn into cards. Try notes with more definitions.", "error");
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't generate cards", "error");
    } finally {
      setGenerating(false);
    }
  }

  async function save() {
    const name = title.trim() || suggestTitle(preview, data.courses.find((c) => c.id === courseId)?.name);
    // A blank deck starts with one placeholder card so the editor has a row to
    // work with — the store rejects a deck with no cards at all.
    const cards = tab === "blank" ? [{ front: "New card", back: "Answer" }] : preview;
    if (!cards.length) return;

    setSaving(true);
    const deck = await addDeck({
      title: name,
      courseId: courseId || null,
      source: tab === "ai" ? "ai" : tab === "paste" ? "paste" : "manual",
      cards,
    });
    setSaving(false);
    if (deck) {
      toast(`Created “${deck.title}” with ${cards.length} card${cards.length === 1 ? "" : "s"}`, "success");
      close();
    }
  }

  const canSave = tab === "blank" || preview.length > 0;

  return (
    <Modal open={open} onClose={close} title="New deck" className="max-w-2xl">
      {atLimit ? (
        <div className="py-6 text-center">
          <p className="text-sm text-muted-foreground">
            The Free plan holds {data.limits.maxDecks} decks. Delete one, or upgrade to Student+ for
            more.
          </p>
          <Button className="mt-4" onClick={close}>
            Got it
          </Button>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex gap-1.5 rounded-xl border border-white/[0.07] bg-white/[0.02] p-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors sm:text-sm",
                  tab === t.id
                    ? "bg-white/[0.07] text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <t.icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Deck name">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Unit 4 vocab"
              />
            </Field>
            <Field label="Course (optional)">
              <Select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
                <option value="">No course</option>
                {data.courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {tab === "paste" && (
            <Field
              label="Your list"
              hint="One card per line. Term and definition separated by a dash, colon, tab or | — or Q:/A: blocks."
            >
              <Textarea
                rows={8}
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                placeholder={"mitochondria - the powerhouse of the cell\nribosome - builds proteins\nnucleus - holds the DNA"}
                className="font-mono text-xs"
              />
            </Field>
          )}

          {tab === "ai" && (
            <>
              <Field
                label="Your notes"
                hint={`${data.ai.label} reads these and pulls out the terms worth knowing. Nothing is saved until you've seen the cards.`}
              >
                <Textarea
                  rows={7}
                  value={notes}
                  onChange={(e) => { setNotes(e.target.value); setGenerated(null); }}
                  placeholder="Paste your class notes, a study guide, or a textbook section…"
                />
              </Field>
              <Button
                variant="outline"
                onClick={generate}
                disabled={generating || notes.trim().length < 40}
                className="w-full"
              >
                {generating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Reading your notes…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" /> Generate cards
                  </>
                )}
              </Button>
            </>
          )}

          {tab === "blank" && (
            <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
              Creates an empty deck with one starter card. You&apos;ll add the rest in the deck editor.
            </p>
          )}

          {preview.length > 0 && (
            <div className="animate-slide-up">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Preview
                </p>
                <Badge tone="primary">{preview.length} cards</Badge>
              </div>
              <ul className="max-h-48 space-y-1.5 overflow-y-auto rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 scrollbar-thin">
                {preview.map((c, i) => (
                  <li key={i} className="flex gap-3 text-sm">
                    <span className="w-2/5 shrink-0 truncate font-medium">{c.front}</span>
                    <span className="flex-1 truncate text-muted-foreground">{c.back}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button onClick={save} loading={saving} disabled={!canSave}>
              Create deck
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** Fall back to something readable when the student doesn't name the deck. */
function suggestTitle(cards: ParsedCard[], courseName?: string): string {
  if (courseName) return `${courseName} practice`;
  const first = cards[0]?.front?.trim();
  return first ? `${first.slice(0, 40)} & more` : "Untitled deck";
}

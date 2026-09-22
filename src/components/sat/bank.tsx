"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Check, ChevronLeft, ChevronRight, ExternalLink, Minus, Plus, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { MultiChips, SingleChips } from "@/components/ui/choice-chips";
import { toast } from "@/components/ui/toaster";
import { useSat } from "@/lib/sat/store";
import { useCatalog } from "@/lib/sat/hooks";
import { catalogRows, getQuestions } from "@/lib/sat/qbank";
import { COLLEGE_BOARD_BANK_URL, DIFF_NAME, DOMAINS, SKILL_ORDER } from "@/lib/sat/constants";
import type { CatalogRow, Difficulty, Question, Section, TestKind } from "@/lib/sat/types";
import { cn } from "@/lib/utils";
import { ErrorBlock, LoadingBlock, SatHeader } from "./common";
import { DifficultyBadge, LETTERS, OptionRow, QuestionHtml, Sheet } from "./question";
import { useSatActions } from "./use-sat-actions";

const PER_PAGE = 10;

// The selection outlives a visit to another screen, as it did in ScoreClimb.
const selection = new Set<string>();

export function QuestionBank() {
  const { s } = useSat();
  const catalog = useCatalog();
  const { busy, startSet } = useSatActions();

  const [test, setTest] = useState<TestKind>("sat");
  const [section, setSection] = useState<Section | "all">("all");
  const [domains, setDomains] = useState<string[]>([]);
  const [skills, setSkills] = useState<string[]>([]);
  const [diffs, setDiffs] = useState<Difficulty[]>([]);
  const [page, setPage] = useState(1);
  const [ids, setIds] = useState("");
  const [, setSelVersion] = useState(0);
  const [preview, setPreview] = useState<{ row: CatalogRow; q: Question } | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);

  const bump = () => setSelVersion((n) => n + 1);

  const rows = useMemo(() => {
    if (!catalog.data) return [];
    return catalogRows(catalog.data, test, section).filter(
      (r) =>
        (!domains.length || domains.includes(r.domain)) &&
        (!skills.length || skills.includes(r.skill)) &&
        (!diffs.length || diffs.includes(r.difficulty)),
    );
  }, [catalog.data, test, section, domains, skills, diffs]);

  const skillOptions = useMemo(() => {
    if (section === "all" || !catalog.data) return [];
    const codes = new Set(catalog.data[test][section].map((r) => r[3]));
    return [...codes]
      .sort((a, b) => SKILL_ORDER.indexOf(a) - SKILL_ORDER.indexOf(b))
      .map((code) => ({ value: code, label: catalog.data!.skills[code] ?? code }));
  }, [catalog.data, test, section]);

  const pages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
  const current = Math.min(Math.max(1, page), pages);
  const pageRows = rows.slice((current - 1) * PER_PAGE, current * PER_PAGE);
  const pageAllSelected = pageRows.length > 0 && pageRows.every((r) => selection.has(r.key));

  function resetPage<T>(set: (v: T) => void) {
    return (v: T) => {
      set(v);
      setPage(1);
    };
  }

  function toggle(key: string) {
    if (selection.has(key)) selection.delete(key);
    else selection.add(key);
    bump();
  }

  function togglePage(on: boolean) {
    for (const r of pageRows) {
      if (on) selection.add(r.key);
      else selection.delete(r.key);
    }
    bump();
  }

  async function openPreview(row: CatalogRow) {
    setPreviewing(row.key);
    try {
      const [q] = await getQuestions([row.key]);
      if (!q) return toast("Couldn't load that question — check your connection.", "error");
      setPreview({ row, q });
    } finally {
      setPreviewing(null);
    }
  }

  /** Teacher-assigned IDs: the site's 8-character IDs, or full internal keys. */
  function findByIds() {
    if (!catalog.data) return;
    const tokens = ids.trim().toLowerCase().split(/[\s,;]+/).filter(Boolean);
    if (!tokens.length) return toast("Paste one or more question IDs first.", "error");
    const all = [...catalogRows(catalog.data, "sat", "all"), ...catalogRows(catalog.data, "psat", "all")];
    const found: CatalogRow[] = [];
    const missing: string[] = [];
    for (const t of tokens) {
      const r = all.find((x) => x.qid.toLowerCase() === t || x.key.toLowerCase() === t || x.key.toLowerCase().startsWith(t));
      if (r) {
        found.push(r);
        selection.add(r.key);
      } else missing.push(t);
    }
    bump();
    if (found.length === 1 && !missing.length) {
      toast("Found 1 question.", "success");
      void openPreview(found[0]);
    } else if (found.length && !missing.length) {
      toast(`Found and selected all ${found.length} questions.`, "success");
    } else if (found.length) {
      toast(`Selected ${found.length} — couldn't find: ${missing.join(", ")}`, "info");
    } else {
      toast(`No matches for: ${missing.join(", ")}`, "error");
    }
  }

  /** Start on exactly the selected questions, in the College Board site's order. */
  function practiceSelected() {
    if (!catalog.data || !selection.size) return;
    const order = new Map(catalogRows(catalog.data, test, "all").map((r, i) => [r.key, i]));
    const keys = [...selection].sort((a, b) => (order.get(a) ?? Infinity) - (order.get(b) ?? Infinity));
    void startSet("bank", () => getQuestions(keys), "mixed");
  }

  return (
    <>
      <SatHeader
        title="Question bank"
        description="Every question with its College Board ID, in the same order as the official question bank. Filter and tick the ones you want — or paste the IDs your teacher assigned — then practise exactly those."
        action={
          <a href={COLLEGE_BOARD_BANK_URL} target="_blank" rel="noopener noreferrer">
            <Button variant="ghost" size="sm">
              College Board bank
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          </a>
        }
      />

      {catalog.error ? (
        <ErrorBlock message={`Couldn't load the question bank — ${catalog.error}.`} onRetry={catalog.retry} />
      ) : !catalog.data ? (
        <LoadingBlock label="Loading the question bank…" />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[340px_1fr]">
          <div className="space-y-4">
            <Card className="space-y-3 p-5">
              <Field label="Find by ID">
                <Textarea
                  value={ids}
                  onChange={(e) => setIds(e.target.value)}
                  rows={2}
                  className="min-h-0"
                  placeholder="e.g. f1bfbed3, ebb87d1e — commas, spaces or new lines"
                />
              </Field>
              <Button variant="outline" size="sm" onClick={findByIds}>
                <Search className="h-3.5 w-3.5" />
                Find &amp; select
              </Button>
            </Card>

            <Card className="space-y-5 p-5">
              <Field label="Test">
                <SingleChips<TestKind>
                  label="Test"
                  value={test}
                  onChange={(v) => {
                    setTest(v);
                    setSkills([]);
                    setPage(1);
                  }}
                  options={[{ value: "sat", label: "SAT" }, { value: "psat", label: "PSAT/NMSQT" }]}
                />
              </Field>
              <Field label="Section">
                <SingleChips<Section | "all">
                  label="Section"
                  value={section}
                  onChange={(v) => {
                    setSection(v);
                    setDomains([]);
                    setSkills([]);
                    setPage(1);
                  }}
                  options={[{ value: "all", label: "All" }, { value: "rw", label: "Reading & Writing" }, { value: "math", label: "Math" }]}
                />
              </Field>
              {section !== "all" && (
                <Field label="Domain">
                  <MultiChips
                    label="Domain"
                    allLabel="All domains"
                    value={domains}
                    onChange={resetPage(setDomains)}
                    options={DOMAINS[section].map((d) => ({ value: d.code, label: d.name }))}
                  />
                </Field>
              )}
              <Field label="Difficulty">
                <MultiChips<Difficulty>
                  label="Difficulty"
                  allLabel="Any"
                  value={diffs}
                  onChange={resetPage(setDiffs)}
                  options={(["E", "M", "H"] as const).map((d) => ({ value: d, label: DIFF_NAME[d] }))}
                />
              </Field>
              {section !== "all" && (
                <Field label="Skill">
                  <MultiChips label="Skill" allLabel="All skills" value={skills} onChange={resetPage(setSkills)} options={skillOptions} />
                </Field>
              )}
            </Card>
          </div>

          <Card className="flex flex-col p-0">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={pageAllSelected}
                  onChange={(e) => togglePage(e.target.checked)}
                  className="h-4 w-4 accent-[hsl(var(--primary))]"
                />
                Select page
              </label>
              <span className="text-sm text-muted-foreground">
                {rows.length.toLocaleString()} question{rows.length === 1 ? "" : "s"} match
              </span>
            </div>

            <div className="hidden grid-cols-[2rem_7rem_7rem_1fr_6rem] gap-3 px-5 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:grid">
              <span />
              <span>ID</span>
              <span>Section</span>
              <span>Skill</span>
              <span>Difficulty</span>
            </div>

            <ul className="divide-y divide-white/[0.06]">
              {pageRows.map((r) => {
                const picked = selection.has(r.key);
                return (
                  <li
                    key={r.key}
                    className={cn(
                      "grid grid-cols-[2rem_1fr] items-center gap-x-3 gap-y-1 px-5 py-3 transition-colors sm:grid-cols-[2rem_7rem_7rem_1fr_6rem]",
                      picked && "bg-primary/[0.06]",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={picked}
                      onChange={() => toggle(r.key)}
                      aria-label={`Select question ${r.qid}`}
                      className="h-4 w-4 accent-[hsl(var(--primary))]"
                    />
                    <button
                      type="button"
                      onClick={() => openPreview(r)}
                      className="flex items-center gap-1.5 text-left font-mono text-sm hover:text-primary sm:col-auto"
                    >
                      {previewing === r.key ? <span className="text-muted-foreground">Loading…</span> : r.qid}
                      {s.seen[r.key] && <Check className="h-3.5 w-3.5 text-success" aria-label="Already practised" />}
                    </button>
                    <button type="button" onClick={() => openPreview(r)} className="col-start-2 text-left text-sm text-muted-foreground sm:col-auto">
                      {r.section === "rw" ? "R&W" : "Math"}
                    </button>
                    <button type="button" onClick={() => openPreview(r)} className="col-start-2 text-left text-sm sm:col-auto">
                      {r.skillDesc}
                    </button>
                    <span className="col-start-2 sm:col-auto">
                      <DifficultyBadge d={r.difficulty} />
                    </span>
                  </li>
                );
              })}
              {!pageRows.length && <li className="px-5 py-10 text-center text-sm text-muted-foreground">No questions match these filters.</li>}
            </ul>

            <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] px-5 py-3">
              <Button variant="ghost" size="sm" onClick={() => setPage(current - 1)} disabled={current <= 1}>
                <ChevronLeft className="h-4 w-4" />
                Prev
              </Button>
              <span className="text-sm text-muted-foreground">Page {current} of {pages}</span>
              <Button variant="ghost" size="sm" onClick={() => setPage(current + 1)} disabled={current >= pages}>
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-white/[0.06] px-5 py-4">
              <Button onClick={practiceSelected} disabled={!selection.size} loading={busy === "bank"}>
                Practise selected ({selection.size})
                <ArrowRight className="h-4 w-4" />
              </Button>
              {selection.size > 0 && (
                <Button variant="ghost" onClick={() => { selection.clear(); bump(); }}>
                  Clear selection
                </Button>
              )}
            </div>
          </Card>
        </div>
      )}

      <Modal
        open={Boolean(preview)}
        onClose={() => setPreview(null)}
        title={preview ? `Question ${preview.row.qid}` : ""}
        className="max-w-2xl"
      >
        {preview && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge tone="muted">{preview.q.section === "rw" ? "Reading & Writing" : "Math"}</Badge>
              <Badge tone="muted">{preview.q.skillDesc}</Badge>
              <DifficultyBadge d={preview.q.difficulty} />
            </div>
            <Sheet className="max-h-[50vh] space-y-4 overflow-y-auto">
              {preview.q.stimulus && <QuestionHtml html={preview.q.stimulus} />}
              {preview.q.stem && <QuestionHtml html={preview.q.stem} className="font-semibold" />}
              {preview.q.type === "mcq" ? (
                <div className="space-y-2">
                  {LETTERS.map((L, i) => (
                    <OptionRow key={L} letter={L} html={preview.q.options[i] ?? ""} state="idle" />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Student-produced response — you type the answer.</p>
              )}
            </Sheet>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="ghost" onClick={() => setPreview(null)}>Close</Button>
              <Button variant="outline" onClick={() => toggle(preview.row.key)}>
                {selection.has(preview.row.key) ? <><Minus className="h-4 w-4" />Remove from my set</> : <><Plus className="h-4 w-4" />Add to my set</>}
              </Button>
              <Button
                onClick={() => {
                  const key = preview.row.key;
                  setPreview(null);
                  void startSet("preview", () => getQuestions([key]), "mixed", "Question content isn't available.");
                }}
              >
                Practise this question
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

"use client";

import { useRef, useState } from "react";
import { Download, ExternalLink, MessageSquare, Plus, RotateCcw, Save, Upload } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { SectionTitle } from "@/components/ui/misc";
import { SingleChips } from "@/components/ui/choice-chips";
import { Modal } from "@/components/ui/modal";
import { confirm } from "@/components/ui/confirm";
import { toast } from "@/components/ui/toaster";
import { authedApi } from "@/lib/client";
import { commit, replaceState, sat, useSat } from "@/lib/sat/store";
import { defaultState, parseState, todayStr } from "@/lib/sat/engine";
import { COLLEGE_BOARD_BANK_URL, DESMOS_URL } from "@/lib/sat/constants";
import { SatHeader } from "./common";
import { ScoreSlider } from "./onboarding";
import { LogExamDialog } from "./log-exam";

export function SatSettings() {
  const { s } = useSat();
  const p = s.profile!;

  const [name, setName] = useState(p.name);
  const [satDate, setSatDate] = useState(p.tests.sat.testDate ?? "");
  const [satTarget, setSatTarget] = useState(p.tests.sat.targetScore);
  const [psatDate, setPsatDate] = useState(p.tests.psat.testDate ?? "");
  const [psatTarget, setPsatTarget] = useState(p.tests.psat.targetScore);
  const [goal, setGoal] = useState(String(p.dailyGoal) as "5" | "10" | "20");
  const [logging, setLogging] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function save() {
    if (!name.trim()) return toast("Enter a name first.", "error");
    commit((st) => {
      const pr = st.profile!;
      pr.name = name.trim();
      pr.tests.sat.testDate = satDate || null;
      pr.tests.sat.targetScore = satTarget;
      pr.tests.psat.testDate = psatDate || null;
      pr.tests.psat.targetScore = psatTarget;
      pr.dailyGoal = +goal;
    });
    toast("SAT settings saved.", "success");
  }

  /** Progress lives only in this browser — a backup is the student's safety net. */
  function exportData() {
    const blob = new Blob([JSON.stringify(sat(), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `scoreclimb-backup-${todayStr()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast("Backup downloaded.", "success");
  }

  function importData(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      let imported: unknown;
      try {
        imported = JSON.parse(String(reader.result));
      } catch {
        return toast("That file isn't valid — couldn't read it.", "error");
      }
      if (!imported || typeof imported !== "object" || !(imported as { profile?: unknown }).profile) {
        return toast("That doesn't look like a SAT Prep (ScoreClimb) backup.", "error");
      }
      const yes = await confirm({
        title: "Restore this backup?",
        body: "It replaces all current SAT progress, streaks and settings on this device.",
        confirmLabel: "Restore",
        destructive: true,
      });
      if (!yes) return;
      replaceState(parseState(imported));
      toast("Backup restored.", "success");
    };
    reader.onerror = () => toast("Couldn't read that file.", "error");
    reader.readAsText(file);
  }

  async function reset() {
    const yes = await confirm({
      title: "Erase all SAT progress?",
      body: "Every streak, score, badge and setting in SAT Prep is deleted from this device. Download a backup first if you might want it back.",
      confirmLabel: "Erase everything",
      destructive: true,
    });
    if (yes) replaceState(defaultState());
  }

  return (
    <>
      <SatHeader title="SAT settings" description="Your test dates, targets and daily goal — plus backups." />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="space-y-5 p-5 sm:p-6">
          <SectionTitle>Profile &amp; goals</SectionTitle>
          <Field label="Your name">
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} autoComplete="off" />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="SAT test date">
              <Input type="date" value={satDate} onChange={(e) => setSatDate(e.target.value)} />
            </Field>
            <Field label="PSAT/NMSQT test date">
              <Input type="date" value={psatDate} onChange={(e) => setPsatDate(e.target.value)} />
            </Field>
          </div>
          <ScoreSlider label="SAT target" value={satTarget} onChange={setSatTarget} min={400} max={1600} />
          <ScoreSlider label="PSAT target" value={psatTarget} onChange={setPsatTarget} min={320} max={1520} />

          <Field label="Daily goal (questions)">
            <SingleChips
              label="Daily goal"
              value={goal}
              onChange={setGoal}
              options={[{ value: "5", label: "5" }, { value: "10", label: "10" }, { value: "20", label: "20" }]}
            />
          </Field>

          <Button onClick={save}>
            <Save className="h-4 w-4" />
            Save
          </Button>
        </Card>

        <div className="space-y-6">
          <Card className="space-y-3 p-5">
            <SectionTitle>Outside practice exams</SectionTitle>
            <p className="text-sm text-muted-foreground">
              Took a full-length test somewhere else, like Bluebooky? Log the score so it counts toward your stats.
            </p>
            <Button variant="outline" size="sm" onClick={() => setLogging(true)}>
              <Plus className="h-3.5 w-3.5" />
              Log an outside exam score
            </Button>
          </Card>

          <Card className="space-y-3 p-5">
            <SectionTitle>Backup &amp; restore</SectionTitle>
            <p className="text-sm text-muted-foreground">
              SAT progress lives in this browser. Download a backup before clearing browser data or switching devices. Backups from the
              standalone ScoreClimb site restore here too.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={exportData}>
                <Download className="h-3.5 w-3.5" />
                Download backup
              </Button>
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                <Upload className="h-3.5 w-3.5" />
                Restore from backup
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => {
                  importData(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </div>
            <Button variant="ghost" size="sm" className="text-destructive" onClick={reset}>
              <RotateCcw className="h-3.5 w-3.5" />
              Reset all SAT data
            </Button>
          </Card>

          <Card className="space-y-3 p-5">
            <SectionTitle>Feedback</SectionTitle>
            <p className="text-sm text-muted-foreground">Found a bug or have an idea? It goes straight to the ScoreClimb team.</p>
            <Button variant="outline" size="sm" onClick={() => setFeedbackOpen(true)}>
              <MessageSquare className="h-3.5 w-3.5" />
              Leave a review
            </Button>
          </Card>

          <Card className="space-y-3 p-5">
            <SectionTitle>About &amp; credits</SectionTitle>
            <p className="text-sm text-muted-foreground">
              SAT Prep is built on ScoreClimb. Questions come from the public{" "}
              <a href={COLLEGE_BOARD_BANK_URL} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                College Board SAT Suite Question Bank
              </a>
              . It&apos;s an unofficial study tool — it can&apos;t connect to your real College Board account, so outside scores are entered by hand.
            </p>
            <ul className="space-y-1.5 text-sm">
              {[
                ["Bluebooky", "https://bluebooky.org", "adaptive digital SAT mock exams, countdown, exam library, review & help tools"],
                ["TopTierPrep", "https://toptierprep.com", "full-length digital SAT practice"],
                ["College Board SAT Suite Question Bank", COLLEGE_BOARD_BANK_URL, "source of every question"],
                ["Desmos", DESMOS_URL, "the testing calculator used in Math"],
              ].map(([n, href, d]) => (
                <li key={n} className="text-muted-foreground">
                  <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-foreground hover:text-primary">
                    {n}
                    <ExternalLink className="h-3 w-3" />
                  </a>{" "}
                  — {d}.
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>

      <LogExamDialog open={logging} onClose={() => setLogging(false)} />
      <FeedbackDialog open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </>
  );
}

function FeedbackDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [rating, setRating] = useState<"1" | "2" | "3" | "4" | "5" | "">("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  async function send() {
    if (!message.trim()) return toast("Write something first.", "error");
    setSending(true);
    try {
      await authedApi("/api/sat/feedback", { method: "POST", body: { rating: rating || null, message } });
      toast("Thanks — review sent.", "success");
      setMessage("");
      setRating("");
      onClose();
    } catch (e) {
      toast((e as Error).message || "Couldn't send right now — please try again later.", "error");
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Leave a review" description="Tell us what's working and what you'd like to see.">
      <div className="space-y-4">
        <Field label="Rating">
          <SingleChips
            label="Rating"
            value={rating as "1"}
            onChange={setRating}
            options={(["1", "2", "3", "4", "5"] as const).map((v) => ({ value: v, label: `${v} ★` }))}
          />
        </Field>
        <Field label="Your review or suggestion">
          <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={5} maxLength={1500} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={send} loading={sending}>Submit review</Button>
        </div>
      </div>
    </Modal>
  );
}

"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { commit } from "@/lib/sat/store";
import { todayStr } from "@/lib/sat/engine";

const SOURCES = ["Bluebooky", "TopTierPrep", "College Board Bluebook", "Other"];

/** Log a full-length test taken elsewhere, so it counts toward stats. */
export function LogExamDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [source, setSource] = useState(SOURCES[0]);
  const [date, setDate] = useState(todayStr());
  const [rw, setRw] = useState("");
  const [math, setMath] = useState("");

  function save() {
    const r = +rw;
    const m = +math;
    const ok = (n: number) => n >= 200 && n <= 800;
    if (!date || !ok(r) || !ok(m)) return toast("Enter a date and both scores (200–800).", "error");
    commit((s) => {
      s.external = s.external || [];
      s.external.push({ date, source, rw: r, math: m, total: r + m });
    });
    toast("Exam logged.", "success");
    setRw("");
    setMath("");
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Log an outside exam">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="space-y-4"
      >
        <Field label="Where did you take it?">
          <Select value={source} onChange={(e) => setSource(e.target.value)}>
            {SOURCES.map((s) => <option key={s}>{s}</option>)}
          </Select>
        </Field>
        <Field label="Date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Reading & Writing (200–800)">
            <Input type="number" min={200} max={800} step={10} value={rw} onChange={(e) => setRw(e.target.value)} />
          </Field>
          <Field label="Math (200–800)">
            <Input type="number" min={200} max={800} step={10} value={math} onChange={(e) => setMath(e.target.value)} />
          </Field>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit">Save</Button>
        </div>
      </form>
    </Modal>
  );
}

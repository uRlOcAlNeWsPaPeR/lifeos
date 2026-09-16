"use client";

import { useEffect, useMemo, useState } from "react";
import { Mic, Play, Sparkles, Square, Users, User } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { authedApi } from "@/lib/client";
import { toast } from "@/components/ui/toaster";
import { useAppData } from "@/lib/store/app-data";
import { estimateSeconds, formatDuration } from "@/lib/podcast/script";
import { defaultVoicePair, useVoices, speechSupported } from "@/lib/podcast/speech";
import { LENGTH_CHOICES, type PodcastFormat, type PodcastSegment } from "@/lib/podcast/types";
import { cn } from "@/lib/utils";

interface Generated {
  title: string;
  summary: string;
  segments: PodcastSegment[];
  estimatedSeconds: number;
  engine: string;
}

/**
 * The studio. Notes and options in, a previewable episode out — nothing is
 * saved until the student has seen the script they're about to keep, the same
 * contract as deck creation.
 */
export function CreateEpisode({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, addPodcast } = useAppData();
  const { voices, loading: voicesLoading } = useVoices();

  const [notes, setNotes] = useState("");
  const [title, setTitle] = useState("");
  const [courseId, setCourseId] = useState("");
  const [subject, setSubject] = useState("");
  const [format, setFormat] = useState<PodcastFormat>("solo");
  const [minutes, setMinutes] = useState<number>(5);
  const [hostVoice, setHostVoice] = useState<string | null>(null);
  const [cohostVoice, setCohostVoice] = useState<string | null>(null);
  const [generated, setGenerated] = useState<Generated | null>(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sampling, setSampling] = useState<string | null>(null);

  // Seed the voice pickers once the device's voices arrive.
  useEffect(() => {
    if (voicesLoading || !voices.length || hostVoice) return;
    const pair = defaultVoicePair(voices);
    setHostVoice(pair.host);
    setCohostVoice(pair.cohost);
  }, [voices, voicesLoading, hostVoice]);

  const courses = data.courses;
  // A course-linked episode files under that course; otherwise the typed
  // subject is the folder. Only one of the two is ever in play.
  const filedUnder = courseId
    ? (courses.find((c) => c.id === courseId)?.name ?? null)
    : subject.trim() || null;

  const wordCount = useMemo(
    () => (notes.trim() ? notes.trim().split(/\s+/).length : 0),
    [notes],
  );

  function reset() {
    setNotes(""); setTitle(""); setCourseId(""); setSubject("");
    setFormat("solo"); setMinutes(5); setGenerated(null);
    setGenerating(false); setSaving(false); setSampling(null);
  }

  function close() {
    stopSample();
    reset();
    onClose();
  }

  function stopSample() {
    if (speechSupported()) window.speechSynthesis.cancel();
    setSampling(null);
  }

  /** Speak a line in a voice so the student can hear it before committing. */
  function sampleVoice(voiceId: string | null, role: string) {
    if (!speechSupported() || !voiceId) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(
      "Here's how I'll sound reading your notes back to you.",
    );
    const all = window.speechSynthesis.getVoices();
    const v = all.find((x) => x.voiceURI === voiceId);
    if (v) { utter.voice = v; utter.lang = v.lang; }
    utter.onend = () => setSampling(null);
    utter.onerror = () => setSampling(null);
    setSampling(role);
    window.speechSynthesis.speak(utter);
  }

  async function generate() {
    if (notes.trim().length < 40) {
      toast("Paste a bit more of your notes so there's something to work from.", "error");
      return;
    }
    setGenerating(true);
    stopSample();
    try {
      const res = await authedApi<Generated>("/api/podcast", {
        method: "POST",
        body: {
          notes,
          title: title.trim() || null,
          subject: filedUnder,
          format,
          targetMinutes: minutes,
        },
      });
      setGenerated(res);
      if (!title.trim()) setTitle(res.title);
    } catch (e) {
      toast((e as Error).message || "Couldn't build that episode.", "error");
    } finally {
      setGenerating(false);
    }
  }

  async function save() {
    if (!generated) return;
    setSaving(true);
    stopSample();
    try {
      const saved = await addPodcast({
        title: title.trim() || generated.title,
        summary: generated.summary || null,
        courseId: courseId || null,
        subject: courseId ? null : subject.trim() || null,
        format,
        segments: generated.segments,
        voices: { host: hostVoice, cohost: format === "duo" ? cohostVoice : null },
        targetMinutes: minutes,
        estimatedSeconds: generated.estimatedSeconds || estimateSeconds(generated.segments),
        source: generated.engine === "heuristic" ? "offline" : "ai",
      });
      if (saved) {
        toast(`Saved “${saved.title}”${filedUnder ? ` to ${filedUnder}` : ""}.`);
        close();
      }
    } finally {
      setSaving(false);
    }
  }

  const noVoices = !voicesLoading && voices.length === 0;

  return (
    <Modal
      open={open}
      onClose={close}
      title="New episode"
      description="Paste your notes. LifeOS turns them into something you can listen to."
      className="max-w-2xl"
    >
      <div className="space-y-5">
        <Field
          label="Your notes"
          hint={wordCount ? `${wordCount} words` : "Class notes, a textbook section, a summary — anything you're revising."}
        >
          <Textarea
            value={notes}
            onChange={(e) => { setNotes(e.target.value); setGenerated(null); }}
            placeholder="Paste your notes here…"
            className="min-h-[140px]"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Episode title" hint="Leave blank and one will be written for you.">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Cell respiration recap"
            />
          </Field>

          <Field label="File it under" hint="This is the folder it's saved in.">
            <Select
              value={courseId}
              onChange={(e) => { setCourseId(e.target.value); if (e.target.value) setSubject(""); }}
            >
              <option value="">No class — type a subject</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
            {!courseId && (
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Subject, e.g. Biology"
                className="mt-2"
              />
            )}
          </Field>
        </div>

        {/* Format */}
        <Field label="Format">
          <div className="grid grid-cols-2 gap-2">
            {([
              { id: "solo", label: "One host", desc: "Straight through", icon: User },
              { id: "duo", label: "Two hosts", desc: "A conversation", icon: Users },
            ] as const).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => { setFormat(f.id); setGenerated(null); }}
                className={cn(
                  "flex items-center gap-3 rounded-xl border p-3 text-left transition-colors",
                  format === f.id
                    ? "border-primary/50 bg-primary/10"
                    : "border-white/10 bg-white/[0.02] hover:border-white/20",
                )}
              >
                <f.icon className={cn("h-4 w-4 shrink-0", format === f.id && "text-primary")} />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{f.label}</span>
                  <span className="block text-xs text-muted-foreground">{f.desc}</span>
                </span>
              </button>
            ))}
          </div>
        </Field>

        {/* Length */}
        <Field label="Length" hint="How long you want to listen for.">
          <div className="flex flex-wrap gap-2">
            {LENGTH_CHOICES.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { setMinutes(m); setGenerated(null); }}
                className={cn(
                  "rounded-lg border px-3.5 py-1.5 text-sm transition-colors",
                  minutes === m
                    ? "border-primary/50 bg-primary/10 text-foreground"
                    : "border-white/10 text-muted-foreground hover:border-white/20 hover:text-foreground",
                )}
              >
                {m} min
              </button>
            ))}
          </div>
        </Field>

        {/* Voices */}
        <Field
          label="Voices"
          hint={
            noVoices
              ? "This browser has no speech voices installed."
              : "These come from your device. Hit play to hear one."
          }
        >
          {noVoices ? (
            <p className="text-sm text-muted-foreground">
              Episodes will still save — you just won&apos;t be able to play them here.
            </p>
          ) : (
            <div className="space-y-2">
              <VoiceRow
                label={format === "duo" ? "Host" : "Narrator"}
                value={hostVoice}
                onChange={setHostVoice}
                voices={voices}
                loading={voicesLoading}
                sampling={sampling === "host"}
                onSample={() => (sampling === "host" ? stopSample() : sampleVoice(hostVoice, "host"))}
              />
              {format === "duo" && (
                <VoiceRow
                  label="Co-host"
                  value={cohostVoice}
                  onChange={setCohostVoice}
                  voices={voices}
                  loading={voicesLoading}
                  sampling={sampling === "cohost"}
                  onSample={() =>
                    sampling === "cohost" ? stopSample() : sampleVoice(cohostVoice, "cohost")
                  }
                />
              )}
            </div>
          )}
        </Field>

        {/* Preview */}
        {generated && (
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge>{generated.segments.length} segments</Badge>
              <Badge>{formatDuration(generated.estimatedSeconds)}</Badge>
              {generated.engine === "heuristic" && <Badge>Offline engine</Badge>}
            </div>
            {/* An episode noticeably shorter than asked for means the notes ran
                out. Saying so beats letting the student assume it's a bug —
                neither engine will pad an episode with invented material. */}
            {generated.estimatedSeconds < minutes * 60 * 0.6 && (
              <p className="mb-3 text-xs text-amber-400/90">
                That came out at {formatDuration(generated.estimatedSeconds)} rather than {minutes} minutes —
                these notes only stretch so far. Add more of them for a longer episode; nothing
                gets invented to fill the time.
              </p>
            )}
            {generated.summary && (
              <p className="mb-3 text-sm text-muted-foreground">{generated.summary}</p>
            )}
            <div className="max-h-52 space-y-2 overflow-y-auto scrollbar-thin pr-1">
              {generated.segments.map((s, i) => (
                <p key={i} className="text-sm leading-relaxed">
                  {format === "duo" && (
                    <span
                      className={cn(
                        "mr-1.5 text-xs font-medium uppercase tracking-wide",
                        s.speaker === "cohost" ? "text-sky-400" : "text-primary",
                      )}
                    >
                      {s.speaker === "cohost" ? "Co-host" : "Host"}
                    </span>
                  )}
                  <span className="text-muted-foreground">{s.text}</span>
                </p>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2 border-t border-white/[0.07] pt-4">
          <Button variant="ghost" onClick={close}>Cancel</Button>
          <Button variant={generated ? "outline" : "primary"} onClick={generate} loading={generating}>
            {generating ? (
              <>Building…</>
            ) : generated ? (
              <><Sparkles className="h-4 w-4" />Rebuild</>
            ) : (
              <><Sparkles className="h-4 w-4" />Build episode</>
            )}
          </Button>
          {generated && (
            <Button onClick={save} loading={saving}>
              <Mic className="h-4 w-4" />
              Save episode
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

function VoiceRow({
  label, value, onChange, voices, loading, sampling, onSample,
}: {
  label: string;
  value: string | null;
  onChange: (v: string) => void;
  voices: { id: string; name: string; lang: string }[];
  loading: boolean;
  sampling: boolean;
  onSample: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-xs text-muted-foreground">{label}</span>
      <Select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={loading}
        className="flex-1"
      >
        {loading && <option>Loading voices…</option>}
        {voices.map((v) => (
          <option key={v.id} value={v.id}>{v.name} ({v.lang})</option>
        ))}
      </Select>
      <Button variant="ghost" size="sm" onClick={onSample} disabled={!value}>
        {sampling ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </Button>
    </div>
  );
}


"use client";

// Playback for podcast episodes, on top of the Web Speech API.
//
// Why the browser rather than a hosted text-to-speech API: it costs nothing,
// needs no key, works on the Free plan and offline, starts instantly with no
// generation wait, and gives every student the voices already installed on
// their machine. The trade-off is that there's no audio file to download — the
// saved script is re-spoken each play.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PodcastSegment, Speaker } from "./types";

export interface VoiceOption {
  /** `voiceURI`, stable enough to persist and re-resolve on the same device. */
  id: string;
  name: string;
  lang: string;
  localService: boolean;
}

export const speechSupported = (): boolean =>
  typeof window !== "undefined" && "speechSynthesis" in window;

/**
 * The browser populates its voice list asynchronously, and on Chrome the first
 * `getVoices()` reliably returns an empty array. Resolve on `voiceschanged`,
 * with a timeout so a browser that never fires it doesn't hang the UI.
 */
export function loadVoices(timeoutMs = 2000): Promise<SpeechSynthesisVoice[]> {
  if (!speechSupported()) return Promise.resolve([]);
  const synth = window.speechSynthesis;

  const ready = synth.getVoices();
  if (ready.length) return Promise.resolve(ready);

  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      synth.removeEventListener("voiceschanged", finish);
      resolve(synth.getVoices());
    };
    synth.addEventListener("voiceschanged", finish);
    setTimeout(finish, timeoutMs);
  });
}

/*
 * Voice quality varies wildly within one device's own voice list — a stock
 * OS install mixes its best voices in with legacy/novelty ones, and the Web
 * Speech API gives no quality signal of its own. These are the naming
 * patterns each OS actually uses for its better voices, so the picker can
 * rank by them instead of falling back to plain alphabetical order.
 */

// macOS/iOS: Apple appends the tier to the name once a higher-quality voice
// is downloaded (System Settings → Accessibility → Spoken Content) — a bare
// "Ava" or "Samantha" is the default low-fi "Compact" version.
const MACOS_BEST = /\(premium\)/i;
const MACOS_BETTER = /\(enhanced\)/i;
// Apple's built-in novelty/sound-effect voices — fun, never what you want
// read a study episode in.
const MACOS_NOVELTY = new Set([
  "albert", "bad news", "bahh", "bells", "boing", "bubbles", "cellos",
  "wobble", "zarvox", "trinoids", "jester", "organ", "superstar", "whisper",
  "deranged", "hysterical", "pipe organ", "good news", "minor", "junior",
  "kathy", "ralph", "fred",
]);

// Windows: Edge/Chrome expose Microsoft's newer cloud-quality voices
// alongside the legacy SAPI5 ones — the good ones are marked "(Natural)".
// Old "Desktop" voices (David, Zira, Mark) are the robotic default.
const WINDOWS_BEST = /\(natural\)/i;
const WINDOWS_WORSE = /\bdesktop\b/i;

// Chrome (any OS) also offers Google's own network voices — solid quality,
// not device-dependent.
const GOOGLE_NETWORK = /^google\s/i;

/**
 * Lower = better. Used to rank voices within a device's own list — it can
 * only ever compare voices actually installed there, so a Mac never sees
 * "Windows voices" or vice versa; each OS's own naming convention just
 * happens to match one of these tiers.
 */
function voiceQualityRank(name: string): number {
  const bare = name.replace(/\s*\([^)]*\)\s*/g, "").trim().toLowerCase();
  if (MACOS_NOVELTY.has(bare)) return 5;
  if (MACOS_BEST.test(name) || WINDOWS_BEST.test(name)) return 0;
  if (MACOS_BETTER.test(name) || GOOGLE_NETWORK.test(name)) return 1;
  if (WINDOWS_WORSE.test(name)) return 3;
  return 2;
}

/** Best-sounding first, then English voices — most study notes are in English. */
export function sortVoices(voices: SpeechSynthesisVoice[]): VoiceOption[] {
  return voices
    .map((v) => ({ id: v.voiceURI, name: v.name, lang: v.lang, localService: v.localService }))
    .sort((a, b) => {
      const aEn = a.lang.startsWith("en") ? 0 : 1;
      const bEn = b.lang.startsWith("en") ? 0 : 1;
      if (aEn !== bEn) return aEn - bEn;
      const rank = voiceQualityRank(a.name) - voiceQualityRank(b.name);
      if (rank !== 0) return rank;
      return a.name.localeCompare(b.name);
    });
}

// A stock OS install bundles voices for dozens of languages and English
// accents nobody asked for here — keep just the two generic ones.
const GENERIC_ENGLISH = new Set(["en-us", "en-gb"]);

/**
 * Drop every voice except generic American/British English — every other
 * language and every other English accent (Australian, Indian, Irish,
 * Scottish, South African, Canadian...) is gone, not just deprioritized.
 * Falls back to whatever English (then whatever at all) the device actually
 * has if that filter would otherwise leave the picker empty.
 */
export function filterToGenericEnglish(voices: VoiceOption[]): VoiceOption[] {
  const generic = voices.filter((v) => GENERIC_ENGLISH.has(v.lang.toLowerCase()));
  if (generic.length) return generic;
  const anyEnglish = voices.filter((v) => v.lang.toLowerCase().startsWith("en"));
  return anyEnglish.length ? anyEnglish : voices;
}

/**
 * Keep only the best quality tier this specific device actually has —
 * Premium/Natural if any exist, hiding every Standard voice; otherwise
 * Enhanced/Google if any exist; and so on down to Standard. A device's voice
 * tier is entirely local to that machine (there's no way for a website to
 * install or force a particular voice on a visitor), so "best available"
 * has to be computed per-device rather than assumed — this is what makes
 * every visitor get the best THEY have, without leaving someone whose
 * device only offers Standard voices with an empty picker.
 */
export function filterToBestTier(voices: VoiceOption[]): VoiceOption[] {
  if (!voices.length) return voices;
  const ranked = voices.map((v) => ({ v, rank: voiceQualityRank(v.name) }));
  const best = Math.min(...ranked.map((r) => r.rank));
  return ranked.filter((r) => r.rank === best).map((r) => r.v);
}

/** True once any voice in the list is a Premium/Natural/Enhanced/Google-tier one. */
export function hasHighQualityVoice(voices: VoiceOption[]): boolean {
  return voices.some((v) => voiceQualityRank(v.name) <= 1);
}

/** Load the device's voices once and keep them for the session. */
export function useVoices() {
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    loadVoices().then((list) => {
      if (!alive) return;
      setVoices(filterToBestTier(filterToGenericEnglish(sortVoices(list))));
      setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  return { voices, loading, supported: speechSupported(), hasHighQuality: hasHighQualityVoice(voices) };
}

/**
 * Pick two voices that sound different from each other, for a duo episode's
 * default. Falls back gracefully when the device offers only one.
 */
export function defaultVoicePair(voices: VoiceOption[]): { host: string | null; cohost: string | null } {
  const en = voices.filter((v) => v.lang.startsWith("en"));
  const pool = en.length ? en : voices;
  return {
    host: pool[0]?.id ?? null,
    cohost: pool[1]?.id ?? pool[0]?.id ?? null,
  };
}

export interface PlayerState {
  supported: boolean;
  playing: boolean;
  paused: boolean;
  /** Index into `segments`, or -1 when stopped. */
  current: number;
  rate: number;
}

/**
 * Sequential playback of an episode's segments, each in its speaker's voice.
 *
 * The Web Speech queue is deliberately not used for the whole episode at once:
 * driving one utterance at a time is what makes skip, restart-from-here and
 * accurate progress possible.
 */
export function usePodcastPlayer(
  segments: PodcastSegment[],
  voiceIds: { host: string | null; cohost: string | null },
) {
  const [state, setState] = useState<PlayerState>({
    supported: false,
    playing: false,
    paused: false,
    current: -1,
    rate: 1,
  });

  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  // Mirrors `current` for use inside speech callbacks, which close over a
  // stale render otherwise.
  const indexRef = useRef(-1);
  const rateRef = useRef(1);
  const segmentsRef = useRef(segments);
  const voiceIdsRef = useRef(voiceIds);
  // Set while we cancel deliberately, so the resulting `end` event doesn't get
  // mistaken for a segment finishing and advance the episode.
  const abortingRef = useRef(false);

  segmentsRef.current = segments;
  voiceIdsRef.current = voiceIds;

  useEffect(() => {
    setState((s) => ({ ...s, supported: speechSupported() }));
    loadVoices().then((v) => { voicesRef.current = v; });
  }, []);

  const resolveVoice = useCallback((speaker: Speaker): SpeechSynthesisVoice | null => {
    const wanted = speaker === "cohost" ? voiceIdsRef.current.cohost : voiceIdsRef.current.host;
    if (!wanted) return null;
    // A saved voice may not exist on this device (different machine, different
    // OS); fall through to the browser default rather than failing to speak.
    return voicesRef.current.find((v) => v.voiceURI === wanted) ?? null;
  }, []);

  const stop = useCallback(() => {
    if (!speechSupported()) return;
    abortingRef.current = true;
    window.speechSynthesis.cancel();
    indexRef.current = -1;
    setState((s) => ({ ...s, playing: false, paused: false, current: -1 }));
  }, []);

  const speakFrom = useCallback(
    (index: number) => {
      if (!speechSupported()) return;
      const list = segmentsRef.current;
      if (index < 0 || index >= list.length) {
        stop();
        return;
      }

      abortingRef.current = true;
      window.speechSynthesis.cancel();
      abortingRef.current = false;

      indexRef.current = index;
      setState((s) => ({ ...s, playing: true, paused: false, current: index }));

      const utter = new SpeechSynthesisUtterance(list[index].text);
      const voice = resolveVoice(list[index].speaker);
      if (voice) {
        utter.voice = voice;
        // Some engines ignore `voice` unless `lang` agrees with it.
        utter.lang = voice.lang;
      }
      utter.rate = rateRef.current;

      utter.onend = () => {
        if (abortingRef.current) return;
        const next = indexRef.current + 1;
        if (next < segmentsRef.current.length) speakFrom(next);
        else {
          indexRef.current = -1;
          setState((s) => ({ ...s, playing: false, paused: false, current: -1 }));
        }
      };
      utter.onerror = (e) => {
        // "interrupted"/"canceled" are what a deliberate stop or skip produces.
        if (abortingRef.current || e.error === "interrupted" || e.error === "canceled") return;
        console.error("[podcast] speech error:", e.error);
        setState((s) => ({ ...s, playing: false, paused: false }));
      };

      window.speechSynthesis.speak(utter);
    },
    [resolveVoice, stop],
  );

  const play = useCallback((from = 0) => speakFrom(from), [speakFrom]);

  const pause = useCallback(() => {
    if (!speechSupported()) return;
    window.speechSynthesis.pause();
    setState((s) => ({ ...s, paused: true, playing: false }));
  }, []);

  const resume = useCallback(() => {
    if (!speechSupported()) return;
    window.speechSynthesis.resume();
    setState((s) => ({ ...s, paused: false, playing: true }));
  }, []);

  const skip = useCallback(
    (delta: number) => {
      const target = Math.max(0, indexRef.current + delta);
      if (target >= segmentsRef.current.length) stop();
      else speakFrom(target);
    },
    [speakFrom, stop],
  );

  const setRate = useCallback(
    (rate: number) => {
      rateRef.current = rate;
      setState((s) => ({ ...s, rate }));
      // Rate only applies to a new utterance, so restart the current segment.
      if (indexRef.current >= 0) speakFrom(indexRef.current);
    },
    [speakFrom],
  );

  // Chrome silently stops synthesising after roughly 15 seconds unless the
  // queue is nudged. Pinging resume() while speaking keeps long segments alive;
  // it's a no-op on browsers that don't need it.
  useEffect(() => {
    if (!state.playing) return;
    const id = setInterval(() => {
      const synth = window.speechSynthesis;
      if (synth.speaking && !synth.paused) synth.resume();
    }, 10_000);
    return () => clearInterval(id);
  }, [state.playing]);

  // Never leave a page still talking.
  useEffect(() => {
    return () => {
      if (speechSupported()) {
        abortingRef.current = true;
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const { current } = state;
  const progress = useMemo(() => {
    if (current < 0 || !segments.length) return 0;
    return (current + 1) / segments.length;
  }, [current, segments.length]);

  return { ...state, progress, play, pause, resume, stop, skip, setRate };
}

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

/** English voices first — most study notes are in English — then the rest. */
export function sortVoices(voices: SpeechSynthesisVoice[]): VoiceOption[] {
  return voices
    .map((v) => ({ id: v.voiceURI, name: v.name, lang: v.lang, localService: v.localService }))
    .sort((a, b) => {
      const aEn = a.lang.startsWith("en") ? 0 : 1;
      const bEn = b.lang.startsWith("en") ? 0 : 1;
      if (aEn !== bEn) return aEn - bEn;
      return a.name.localeCompare(b.name);
    });
}

/** Load the device's voices once and keep them for the session. */
export function useVoices() {
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    loadVoices().then((list) => {
      if (!alive) return;
      setVoices(sortVoices(list));
      setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  return { voices, loading, supported: speechSupported() };
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

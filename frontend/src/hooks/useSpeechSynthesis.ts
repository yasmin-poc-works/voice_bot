"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { speakable } from "@/lib/speakable";

function splitSentences(text: string): string[] {
  const parts = text.match(/[^.!?]+[.!?]*\s*/g) ?? [text];
  return parts.map((p) => p.trim()).filter(Boolean);
}

function pickVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const english = voices.filter((v) => v.lang.toLowerCase().startsWith("en"));
  const score = (v: SpeechSynthesisVoice) =>
    (v.lang.toLowerCase() === "en-in" ? 3 : 0) +
    (/natural|online|google/i.test(v.name) ? 2 : 0) +
    (/female|zira|samantha|aria|jenny|heera|neerja/i.test(v.name) ? 1 : 0);
  return english.sort((a, b) => score(b) - score(a))[0] ?? null;
}

export function useSpeechSynthesis() {
  const [speaking, setSpeaking] = useState(false);
  // True when the browser refused to speak because the user has not interacted with the page yet.
  const [blocked, setBlocked] = useState(false);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  // Bumps on every cancel/speak so stale onend callbacks are ignored.
  const runRef = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const load = () => {
      voiceRef.current = pickVoice(window.speechSynthesis.getVoices());
    };
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", load);
      window.speechSynthesis.cancel();
    };
  }, []);

  /** Pillar 5: stop any current speech immediately. */
  const cancel = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    runRef.current += 1;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  /** iOS only allows speech started from a user gesture: call this inside the first tap. */
  const unlock = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    window.speechSynthesis.speak(u);
  }, []);

  /** Speak sentence by sentence (avoids Chrome cutting long utterances). */
  const speak = useCallback(
    (text: string, onDone?: () => void) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) {
        onDone?.();
        return;
      }
      cancel();
      const run = runRef.current;
      const sentences = splitSentences(speakable(text));
      setSpeaking(true);
      sentences.forEach((sentence, i) => {
        const u = new SpeechSynthesisUtterance(sentence);
        u.lang = voiceRef.current?.lang ?? "en-IN";
        if (voiceRef.current) u.voice = voiceRef.current;
        u.rate = 1;
        const finish = () => {
          if (runRef.current !== run) return;
          if (i === sentences.length - 1) {
            setSpeaking(false);
            onDone?.();
          }
        };
        u.onstart = () => setBlocked(false);
        u.onend = finish;
        u.onerror = (e) => {
          if (e.error === "not-allowed") setBlocked(true);
          finish();
        };
        window.speechSynthesis.speak(u);
      });
    },
    [cancel],
  );

  return { speaking, blocked, speak, cancel, unlock };
}

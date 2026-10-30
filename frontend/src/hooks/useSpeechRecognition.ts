"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

// Minimal typings: SpeechRecognition is not in every TS DOM lib.
interface RecognitionResultEvent {
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
}
interface RecognitionErrorEvent {
  error: string;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: RecognitionResultEvent) => void) | null;
  onerror: ((e: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

function getCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export type MicIssue = "unsupported" | "denied" | "no-speech" | "error" | null;

const noopSubscribe = () => () => undefined;

export function useSpeechRecognition(
  onFinal: (text: string) => void,
  onSilence?: () => void,
  /** Called with the running transcript (final + interim) while the user is still talking. */
  onInterim?: (text: string) => void,
  /** Silence (ms) after the last words before the utterance counts as finished. */
  endpointMs = 1500,
) {
  const endpointRef = useRef(endpointMs);
  const recRef = useRef<Recognition | null>(null);
  const onFinalRef = useRef(onFinal);
  const onSilenceRef = useRef(onSilence);
  const onInterimRef = useRef(onInterim);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [micError, setMicError] = useState<MicIssue>(null);
  // Browser support is read after hydration (server snapshot is "not ready") to avoid a mismatch.
  const ready = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const supported = useSyncExternalStore(noopSubscribe, () => getCtor() !== null, () => false);
  const issue: MicIssue = ready && !supported ? "unsupported" : micError;

  useEffect(() => {
    onFinalRef.current = onFinal;
    onSilenceRef.current = onSilence;
    onInterimRef.current = onInterim;
  }, [onFinal, onSilence, onInterim]);

  useEffect(() => {
    endpointRef.current = endpointMs;
  }, [endpointMs]);

  useEffect(() => () => recRef.current?.abort(), []);

  const start = useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor) {
      setMicError("unsupported");
      return;
    }
    recRef.current?.abort();
    const rec = new Ctor();
    rec.lang = "en-IN";
    // Continuous: Chrome would otherwise end the session after ~1 s of pause and cut a long
    // question into pieces. We decide when the user has finished (endpointMs of silence).
    rec.continuous = true;
    rec.interimResults = true;
    let finalText = "";
    let lastInterim = "";
    let endpointTimer: ReturnType<typeof setTimeout> | undefined;

    rec.onresult = (e) => {
      // Every event lists all results since the session began, so rebuild, never append.
      let finals = "";
      let interimText = "";
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finals += `${r[0].transcript} `;
        else interimText += r[0].transcript;
      }
      finalText = finals;
      lastInterim = interimText;
      setInterim(interimText);
      const running = `${finalText} ${interimText}`.trim();
      onInterimRef.current?.(running);
      clearTimeout(endpointTimer);
      if (running) endpointTimer = setTimeout(() => rec.stop(), endpointRef.current);
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") setMicError("denied");
      else if (e.error === "no-speech") setMicError("no-speech");
      else if (e.error !== "aborted") setMicError("error");
    };
    rec.onend = () => {
      clearTimeout(endpointTimer);
      // Ignore the end of a recognizer we replaced or aborted on purpose.
      if (recRef.current !== rec) return;
      recRef.current = null;
      setListening(false);
      setInterim("");
      // Include words not yet marked final when the session was stopped.
      const text = `${finalText} ${lastInterim}`.replace(/\s+/g, " ").trim();
      if (text) onFinalRef.current(text);
      else onSilenceRef.current?.();
    };

    recRef.current = rec;
    setMicError(null);
    setListening(true);
    try {
      rec.start();
    } catch {
      setListening(false);
      setMicError("error");
    }
  }, []);

  const stop = useCallback(() => recRef.current?.stop(), []);
  const abort = useCallback(() => {
    const rec = recRef.current;
    recRef.current = null; // marks it as intentionally ended so onend is ignored
    rec?.abort();
    setListening(false);
    setInterim("");
  }, []);

  return { supported, listening, interim, issue, start, stop, abort };
}

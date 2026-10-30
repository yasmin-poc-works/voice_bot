"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Transcript from "@/components/Transcript";
import VoiceOrb, { type OrbState } from "@/components/VoiceOrb";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { useSpeechSynthesis } from "@/hooks/useSpeechSynthesis";
import { ApiError, sendChat, wakeBackend, type ChatMessage } from "@/lib/api";
import { isEcho, isInterruption } from "@/lib/echo";

const GREETING =
  'Hi, I\'m Yasmin\'s voice bot. Just say "Hello" to start, then ask me about my background, my projects, or how I think about building AI systems. Say "Bye" when you\'re done.';
const WAKE_REPLY =
  "Hi, nice to meet you! I'm listening. Ask me about my life story, my superpower, or my projects.";
const FAREWELL = "Thank you for your time. It was lovely talking with you. Goodbye!";

const SUGGESTIONS = [
  "What should we know about your life story?",
  "What's your #1 superpower?",
  "What are the top 3 areas you'd like to grow in?",
  "What misconception do your coworkers have about you?",
  "How do you push your boundaries and limits?",
];

const FRIENDLY_ERROR =
  "Sorry, I'm having trouble answering right now. Please try again in a moment.";

// A greeting at the start of an utterance wakes the bot: "Hello", "Hi there", "Hey, what is ...".
const WAKE_RE = /^\s*(hello|hi|hey|hai|good (morning|afternoon|evening)|namaste|start)\b[\s,.!?]*/i;
// Short farewell phrases end the conversation. Long sentences are never treated as goodbyes.
const GOODBYE_RE =
  /\b(bye|good ?bye|that'?s all|that is all|that'?s it|see you|talk to you later|have a good day)\b/i;
const GOODBYE_MAX_WORDS = 8;

// Stop listening for a conversation after this many empty turns in a row.
const MAX_SILENT_TURNS = 3;
// How long a silence ends the user's turn. Longer in conversation so a thinking pause
// mid-question does not send half a sentence.
const STANDBY_ENDPOINT_MS = 900;
const CONVERSATION_ENDPOINT_MS = 1800;
// Short pause before the mic restarts, so it does not catch the speaker tail.
const RESTART_DELAY_MS = 600;
// A recognizer result arriving this soon after the bot stopped can still be the bot's own voice.
const ECHO_TAIL_MS = 4000;

/** standby: waiting for "Hello". conversation: hands-free chat. off: not listening at all. */
type Mode = "standby" | "conversation" | "off";

function isGoodbye(message: string): boolean {
  return message.trim().split(/\s+/).length <= GOODBYE_MAX_WORDS && GOODBYE_RE.test(message);
}

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: GREETING },
  ]);
  const [thinking, setThinking] = useState(false);
  const [text, setText] = useState("");
  const [mode, setMode] = useState<Mode>("standby");
  const [notice, setNotice] = useState<string | null>(null);
  // Experimental voice barge-in: keep the mic open while the bot speaks so the user can talk over
  // it. Off by default because the mic can hear the bot's own voice on laptop speakers.
  const [bargeIn, setBargeIn] = useState(false);
  // What the recognizer last heard and what we did with it, shown on screen for debugging.
  const [heard, setHeard] = useState<{ text: string; verdict: string } | null>(null);
  const botTextRef = useRef("");
  const speakingRef = useRef(false);
  const botEndedAtRef = useRef(0);
  // True when the current listening session began while the bot was speaking. Its final text
  // can arrive long after the bot stopped, so it must still be checked for echo.
  const sessionOverlapRef = useRef(false);
  // Created lazily in an event handler: random values must not be read during prerender.
  const sessionIdRef = useRef<string | null>(null);
  const messagesRef = useRef(messages);
  const busyRef = useRef(false);
  const silentTurnsRef = useRef(0);
  const micRef = useRef<{ abort: () => void }>({ abort: () => undefined });

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const synth = useSpeechSynthesis();

  useEffect(() => {
    if (speakingRef.current && !synth.speaking) botEndedAtRef.current = Date.now();
    speakingRef.current = synth.speaking;
  }, [synth.speaking]);

  const say = useCallback(
    (reply: string) => {
      botTextRef.current = reply;
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
      synth.speak(reply);
    },
    [synth],
  );

  const handleSend = useCallback(
    async (raw: string) => {
      const message = raw.trim();
      if (!message || busyRef.current) return;

      // Goodbye: short local farewell (no AI call), then stop listening completely.
      if (isGoodbye(message)) {
        setMessages((prev) => [...prev, { role: "user", content: message }]);
        setMode("off");
        micRef.current.abort();
        setNotice(null);
        say(FAREWELL);
        return;
      }

      busyRef.current = true;
      synth.cancel();

      // The greeting is UI-only; do not send it as history.
      const history = messagesRef.current.slice(1);
      setMessages((prev) => [...prev, { role: "user", content: message }]);
      setThinking(true);

      sessionIdRef.current ??= crypto.randomUUID();
      let reply = FRIENDLY_ERROR;
      try {
        reply = (await sendChat(message, history, sessionIdRef.current)).reply;
      } catch (err) {
        if (err instanceof ApiError && err.status === 422) {
          reply = "That message is a bit long. Could you shorten it and ask again?";
        } else if (err instanceof ApiError && err.status === 503 && err.retryAfter) {
          reply = `I'm getting a lot of questions at once. Please ask again in about ${err.retryAfter} seconds.`;
        }
      }
      setThinking(false);
      busyRef.current = false;
      say(reply);
    },
    [synth, say],
  );

  const onFinal = useCallback(
    (spoken: string) => {
      // While the bot talks (and just after), the mic also hears the bot itself: ignore that.
      const botActive =
        sessionOverlapRef.current ||
        speakingRef.current ||
        Date.now() - botEndedAtRef.current < ECHO_TAIL_MS;
      if (botActive && isEcho(spoken, botTextRef.current)) {
        setHeard({ text: spoken, verdict: "ignored: sounded like my own voice" });
        return;
      }

      if (mode === "standby") {
        // Only a greeting wakes the bot; any other speech is ignored.
        const match = WAKE_RE.exec(spoken);
        if (!match) {
          setHeard({ text: spoken, verdict: 'ignored: waiting for "Hello"' });
          return;
        }
        silentTurnsRef.current = 0;
        setNotice(null);
        setMode("conversation");
        const rest = spoken.slice(match[0].length).trim();
        // "Hello, what's your superpower?" starts the conversation and asks right away.
        if (rest.split(/\s+/).filter(Boolean).length >= 3) void handleSend(rest);
        else say(WAKE_REPLY);
        return;
      }
      silentTurnsRef.current = 0;
      setHeard({ text: spoken, verdict: "sent" });
      void handleSend(spoken);
    },
    [mode, handleSend, say],
  );

  const onSilence = useCallback(() => {
    // Silence while the bot is talking is normal, not the user going quiet.
    if (mode !== "conversation" || speakingRef.current) return;
    silentTurnsRef.current += 1;
    if (silentTurnsRef.current >= MAX_SILENT_TURNS) {
      setMode("standby");
      setNotice('I stopped the conversation because I didn\'t hear anything. Say "Hello" to continue.');
    }
  }, [mode]);

  // The user starts talking while the bot is speaking: cut the bot off immediately.
  const onInterim = useCallback(
    (heard: string) => {
      if (mode !== "conversation" || !bargeIn || !speakingRef.current) return;
      if (isInterruption(heard, botTextRef.current)) synth.cancel();
    },
    [mode, bargeIn, synth],
  );

  // Wait longer for the end of a question than for a one-word "Hello", so pauses mid-sentence
  // do not cut the question into pieces.
  const mic = useSpeechRecognition(
    onFinal,
    onSilence,
    onInterim,
    mode === "standby" ? STANDBY_ENDPOINT_MS : CONVERSATION_ENDPOINT_MS,
  );
  const { start: startMic, abort: abortMic } = mic;

  useEffect(() => {
    micRef.current = { abort: abortMic };
  }, [abortMic]);

  useEffect(() => {
    wakeBackend();
    // Browsers only let a page speak after the user has interacted with it once.
    const unlock = () => synth.unlock();
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const micUnavailable = !mic.supported || mic.issue === "denied";
  const listeningMode = mode !== "off" && !micUnavailable;

  // Listening loop (standby and conversation): whenever the bot is idle, listen again.
  // A mic "error" pauses the loop so a failing speech service is not retried in a tight loop.
  const canListenWhileSpeaking = bargeIn && mode === "conversation";
  const shouldListen =
    listeningMode &&
    mic.issue !== "error" &&
    !mic.listening &&
    !thinking &&
    (!synth.speaking || canListenWhileSpeaking);
  useEffect(() => {
    if (!shouldListen) return;
    const id = setTimeout(() => {
      sessionOverlapRef.current = speakingRef.current;
      startMic();
    }, RESTART_DELAY_MS);
    return () => clearTimeout(id);
  }, [shouldListen, startMic]);

  const orbState: OrbState = synth.speaking
    ? "SPEAKING"
    : mic.listening
      ? "LISTENING"
      : thinking
        ? "THINKING"
        : "IDLE";

  const startConversation = () => {
    synth.unlock(); // iOS needs speech to be unlocked inside a user gesture
    silentTurnsRef.current = 0;
    setNotice(null);
    setMode("conversation");
    synth.cancel(); // pillar 5: no overlapping voices
    sessionOverlapRef.current = false;
    startMic(); // start inside the click so the browser's mic permission prompt is allowed
  };

  // Reliable interrupt that does not depend on echo detection: stop the bot, keep the
  // conversation going, and listen right away.
  const interruptBot = () => {
    synth.cancel();
    if (mode === "conversation") {
      sessionOverlapRef.current = false;
      startMic();
    }
  };

  const endConversation = () => {
    setMode("off");
    abortMic();
    synth.cancel();
    setNotice(null);
  };

  const onOrbClick = () => {
    synth.unlock();
    if (synth.speaking) {
      interruptBot();
      return;
    }
    if (mode === "conversation") {
      endConversation();
      return;
    }
    if (thinking || micUnavailable) return;
    startConversation();
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    synth.unlock();
    const value = text;
    setText("");
    void handleSend(value);
  };

  const banner =
    notice ??
    (synth.blocked
      ? "Your browser needs one tap or click on the page before I can speak. Tap anywhere, then say Hello again."
      : mic.issue === "unsupported"
        ? "Voice input isn't supported in this browser. Please type your question below."
        : mic.issue === "denied"
          ? "Microphone access was blocked. You can type your question below instead."
          : mic.issue === "error"
            ? "The microphone had a problem. Tap Start listening to retry, or type your question."
            : mic.issue === "no-speech" && mode === "off"
              ? "I didn't hear anything. Tap the orb and try again."
              : null);

  const sublabel = micUnavailable
    ? "Voice unavailable, type below"
    : mode === "off"
      ? "Conversation ended. Tap to start again"
      : mode === "standby" && orbState === "LISTENING"
        ? 'Listening… say "Hello" to start'
        : mode === "standby"
          ? 'Say "Hello" to start'
          : orbState === "LISTENING"
            ? 'Listening… just speak (say "Bye" to end)'
            : orbState === "IDLE"
              ? "Getting ready to listen…"
              : orbState === "SPEAKING"
                ? bargeIn
                  ? "Speaking… talk or tap to interrupt"
                  : "Speaking… tap to interrupt"
                : undefined;

  const buttonLabel =
    mode === "conversation"
      ? "End conversation"
      : mode === "standby"
        ? "Or tap to start"
        : "Start listening";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-4 px-4 py-6">
      <header className="text-center">
        <h1 className="text-xl font-semibold">Yasmin Iqbal</h1>
        <p className="text-sm text-slate-400">AI-focused backend engineer · Voice interview bot</p>
      </header>

      <VoiceOrb
        state={orbState}
        onClick={onOrbClick}
        disabled={micUnavailable && !mic.listening}
        sublabel={sublabel}
      />

      {!micUnavailable && (
        <div className="flex justify-center gap-2">
          {synth.speaking && (
            <button
              type="button"
              onClick={interruptBot}
              className="rounded-full bg-amber-500 px-5 py-2 text-sm font-medium text-black hover:bg-amber-400"
            >
              Stop and talk
            </button>
          )}
          <button
            type="button"
            onClick={mode === "conversation" ? endConversation : startConversation}
            className={`rounded-full px-5 py-2 text-sm font-medium text-white ${
              mode === "conversation"
                ? "bg-rose-600 hover:bg-rose-500"
                : "bg-indigo-500 hover:bg-indigo-400"
            }`}
          >
            {buttonLabel}
          </button>
        </div>
      )}

      {banner && (
        <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-center text-sm text-amber-200">
          {banner}
        </p>
      )}

      <label className="flex items-center justify-center gap-2 text-xs text-slate-400">
        <input
          type="checkbox"
          checked={bargeIn}
          onChange={(e) => setBargeIn(e.target.checked)}
          className="accent-indigo-500"
        />
        Experimental: interrupt by speaking (use headphones, or the bot may hear itself)
      </label>

      {heard && (
        <p className="text-center text-xs text-slate-500">
          Heard: “{heard.text}” ({heard.verdict})
        </p>
      )}

      <Transcript
        messages={messages}
        interim={synth.speaking ? "" : mic.interim}
        thinking={thinking}
      />

      <div className="flex flex-wrap gap-2">
        {SUGGESTIONS.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => {
              synth.unlock();
              void handleSend(q);
            }}
            disabled={thinking}
            className="rounded-full border border-white/15 px-3 py-1 text-xs text-slate-200 hover:bg-white/10 disabled:opacity-50"
          >
            {q}
          </button>
        ))}
      </div>

      <form onSubmit={onSubmit} className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={500}
          placeholder="Or type your question…"
          aria-label="Type your question"
          className="flex-1 rounded-xl bg-white/10 px-4 py-3 text-sm placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
        />
        <button
          type="submit"
          disabled={thinking || !text.trim()}
          className="rounded-xl bg-indigo-500 px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
        >
          Send
        </button>
      </form>

      <p className="text-center text-xs text-slate-500">
        Conversations are logged to improve this demo.
      </p>
    </main>
  );
}

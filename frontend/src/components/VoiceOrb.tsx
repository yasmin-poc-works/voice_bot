"use client";

export type OrbState = "IDLE" | "LISTENING" | "THINKING" | "SPEAKING" | "PAUSED";

const LABEL: Record<OrbState, string> = {
  IDLE: "Tap to speak",
  LISTENING: "Listening… tap to send",
  THINKING: "Thinking…",
  SPEAKING: "Speaking… tap to interrupt",
  PAUSED: "Paused",
};

interface Props {
  state: OrbState;
  onClick: () => void;
  disabled?: boolean;
  sublabel?: string;
}

export default function VoiceOrb({ state, onClick, disabled, sublabel }: Props) {
  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={LABEL[state]}
        className={`orb orb-${state.toLowerCase()} relative h-28 w-28 rounded-full focus:outline-none focus-visible:ring-4 focus-visible:ring-white/50 disabled:cursor-not-allowed`}
      >
        <span className="orb-ring" aria-hidden />
        <span className="orb-core" aria-hidden />
      </button>
      <p className="text-sm text-slate-300" aria-live="polite">
        {sublabel ?? LABEL[state]}
      </p>
    </div>
  );
}

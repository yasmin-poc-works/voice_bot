"use client";

import { useEffect, useRef } from "react";
import type { ChatMessage } from "@/lib/api";

interface Props {
  messages: ChatMessage[];
  interim?: string;
  thinking?: boolean;
}

export default function Transcript({ messages, interim, thinking }: Props) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, interim, thinking]);

  return (
    <div
      className="flex-1 space-y-3 overflow-y-auto rounded-2xl bg-white/5 p-4"
      role="log"
      aria-live="polite"
    >
      {messages.map((m, i) => (
        <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
          <p
            className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm leading-relaxed ${
              m.role === "user" ? "bg-indigo-500 text-white" : "bg-slate-700 text-slate-100"
            }`}
          >
            {m.content}
          </p>
        </div>
      ))}
      {interim && (
        <div className="flex justify-end">
          <p className="max-w-[85%] rounded-2xl bg-indigo-500/50 px-4 py-2 text-sm italic text-white">
            {interim}
          </p>
        </div>
      )}
      {thinking && (
        <div className="flex justify-start">
          <p className="rounded-2xl bg-slate-700 px-4 py-2 text-sm text-slate-300">…</p>
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}

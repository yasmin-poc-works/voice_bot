# Implementation Plan — Yasmin Iqbal Interview Voice Bot

**Source of truth:** [interview_voice_bot_poc.md](../architecture/interview_voice_bot_poc.md)
**Task tracking:** [task.md](task.md) (update status there as work completes)
**Budget:** ~8 hours. Deadline-driven, so work is split into priority tiers. Do not start a lower tier until the one above is deployed and working.

---

## 1. Decisions Locked for This Plan

These resolve gaps and inconsistencies found in the architecture doc. Change them here (and in the doc) if you disagree.

| # | Decision | Why |
| :--- | :--- | :--- |
| D1 | **Backend: FastAPI (Python).** **Frontend: Next.js (App Router) + Tailwind on Vercel.** Backend hosted on Render/Railway; browser calls it via `NEXT_PUBLIC_API_URL` with CORS locked to the Vercel origin. Streamlit is dropped. | Web Speech API and the voice orb need real browser JS. FastAPI gives async, Pydantic validation, and long-running background tasks. |
| D2 | **No vector DB / embeddings.** The whole dossier is placed in the system prompt. | The dossier is a few KB. RAG adds latency and failure modes for no benefit. Update doc Section 2 and Q3 (Section 9) so the interview answer matches what is built. |
| D3 | **One dossier file:** `data/yasmin_profile.json` (doc uses this name and `yasmin_dossier.json` inconsistently). | Single name everywhere. |
| D4 | **LLM: Groq-hosted `gpt-oss-120b` primary, `gpt-oss-20b` fallback.** One provider, one key (`GROQ_API_KEY`). Low reasoning effort; completion cap 400-600 because reasoning tokens count. **Verify exact Groq model IDs and free-tier limits at implementation time.** OpenAI API, LLaMA and Gemini are not used. | Fallback is needed by session-end rule #7. Both models share one Groq account, so a Groq-wide outage ends the session via the provider-failure path. |
| D5 | **Rate-limit/session counters in Upstash Redis** (free tier), not in-memory. | Free hosts restart and redeploy often, which would reset in-memory counters; Redis also survives scaling to >1 instance. |
| D6 | **Rate limit keyed by IP + session ID.** | A client-generated session UUID can be regenerated to bypass the limit. |
| D7 | **Turn cap = 40, hard cap = 15 min of *active* time (pause excluded).** | Doc had a 25-turn cap below the 30-request limit (pause could never trigger) and a 10-min cap equal to the pause length. |
| D8 | **Client history is untrusted.** Server validates roles, length, and trims to the last 8 messages. Escape `</user_query>` in user input. | Prevents fake "assistant" turns and tag breakout injection. |
| D9 | **Audit store = Upstash Redis list + Discord webhook.** | Free-host disk is ephemeral. |
| D10 | **Background judge and audit writes use FastAPI `BackgroundTasks`.** The judge is stretch (Tier 3) and counts toward the token budget/cost. | Runs after the response without blocking latency; long-running host means tasks are not killed. |
| D11 | **Cold-start mitigation:** frontend pings `GET /health` on page load; an uptime monitor pings every few minutes. | Free-tier backends sleep; a 30-60 s first load would hurt the reviewer's first impression. |

---

## 2. Tiers

| Tier | Meaning | Contents |
| :--- | :--- | :--- |
| **T1: Must ship** | Without these the submission fails | Dossier, `/api/chat`, persona prompt, "I don't know" guardrail, Layer 1-3 injection defense, voice in/out, text fallback (pillar 1), cancel-on-reclick (pillar 5), deploy, submission |
| **T2: Required pillars + lifecycle** | Declared required in doc Section 6 | Rate limit + pause (pillar 3), webhook (pillar 2), 5-state orb (pillar 4), session end rules, Layer 4 validator, memory, audit log |
| **T3: Stretch** | Only if time remains | Async LLM judge + faithfulness score, Groq Whisper STT fallback, signed session tokens |

---

## 3. Target File Structure

```
voice_bot/
  backend/                       # FastAPI (Python)
    app/
      main.py                    # FastAPI app, CORS, /health
      routes/chat.py             # POST /api/chat
      routes/transcribe.py       # (T3) Whisper fallback
      schemas.py                 # Pydantic request/response models
      persona.py                 # system prompt builder
      guardrails.py              # Layer 1 regex, Layer 4 output check, input sanitizer
      llm.py                     # Groq client: gpt-oss-120b, 20b fallback
      limits.py                  # rate limit, token budget, turn/time caps (Redis)
      audit.py                   # audit record + Discord webhook
      judge.py                   # (T3)
      config.py                  # env settings
    data/yasmin_profile.json
    tests/
      test_guardrails.py
      test_chat_api.py
      injection_cases.md
    requirements.txt
    .env.example
  frontend/                      # Next.js + Tailwind (Vercel)
    src/app/page.tsx             # chat + orb UI
    src/components/              # VoiceOrb.tsx, Transcript.tsx, PauseBanner.tsx
    src/hooks/                   # useSpeechRecognition.ts, useSpeechSynthesis.ts, useSession.ts
    .env.example                 # NEXT_PUBLIC_API_URL
  README.md
```

---

## 4. Phases (map to hours)

| Phase | Hour | Tier | Outcome |
| :--- | :--- | :--- | :--- |
| 0. Setup & decisions | 1 | T1 | Repo scaffolded, envs wired, FastAPI `/health` deployed on Render/Railway and "hello" page on Vercel, talking to each other |
| 1. Persona dossier | 2 | T1 | `yasmin_profile.json` with real, factual content |
| 2. Chat API core | 3 | T1 | `/api/chat` returns in-persona answers, with "I don't know" fallback |
| 3. Guardrails L1-L3 | 3-4 | T1 | Regex filter, `<user_query>` sandbox, hardened prompt |
| 4. Voice client | 4 | T1 | Mic → text → API → spoken reply; text fallback; cancel on re-click |
| 5. UI & orb | 5 | T1/T2 | Transcript, orb states, greeting, suggested questions, mobile-friendly |
| 6. Limits & lifecycle | 6 | T2 | Request limit + `PAUSED`, token budget, idle/hard caps, goodbye |
| 7. Observability | 6-7 | T2 | Audit record, Discord webhook, Layer 4 validator |
| 8. Testing | 7 | T1/T2 | Injection suite, out-of-scope, pillar tests, mobile/cross-browser |
| 9. Deploy & submit | 8 | T1 | Public HTTPS URL, README, email sent |
| 10. Stretch | leftover | T3 | Judge, Whisper fallback, signed sessions |

Note: Hour 6 in the doc's original sprint table is overloaded (guardrail testing + 5 pillars + lifecycle). This plan moves pillar 1 and 5 into Phase 4 and the orb into Phase 5.

---

## 5. Known Risks & Mitigations

| Risk | Mitigation |
| :--- | :--- |
| `SpeechRecognition` missing in Firefox / unreliable on iOS Safari | Feature-detect; fall back to text input (pillar 1). Test on Chrome desktop, Android Chrome, iOS Safari. |
| iOS blocks `speechSynthesis.speak()` outside a user gesture | "Unlock" synthesis with a silent utterance on the first tap; keep speak calls inside the tap handler chain where possible. |
| Chrome cuts long utterances (~15 s) | Split replies into sentences and queue them. |
| Mic picks up the bot's own voice | Push-to-talk; mic disabled while `SPEAKING`. |
| Doc claim "Web Speech never fails" is overstated (Chrome STT uses a Google network service, needs HTTPS) | Soften the interview answer (Section 9 Q1); rely on the text fallback. |
| Doc Q3 mentions a cosine-similarity gate that is not built | Reword Q3 to the prompt-grounding + Layer 4 approach actually implemented (D2). |
| Persona content in doc Section 7 is generic placeholder text | Replace with Yasmin's real, verifiable facts in Phase 1; the closed-world rule means anything missing becomes "I haven't worked on that". |
| Groq quota exhaustion or outage | Request limit + token budget + 120b→20b fallback; the judge (T3) is off by default; a Groq-wide outage ends in the provider-failure path. |
| gpt-oss reasoning tokens return empty replies or add latency | Low reasoning effort, completion cap 400-600, handle empty content by retrying on 20b; measure in task 0.15. |
| Backend cold start on free tier | `/health` wake-up ping on page load + uptime monitor (D11). |
| CORS misconfiguration between Vercel and the backend | Allowlist the exact Vercel origin; test from the deployed frontend, not just localhost. |
| Client IP is the proxy's IP behind the host | Read `X-Forwarded-For` (first/trusted hop) for the rate-limit key. |
| Logging interviewer questions | Show a one-line notice in the UI that conversations are logged. |

---

## 6. Definition of Done

- Public HTTPS URL works with no keys or sign-up, on desktop and mobile.
- All 5 core questions answered in 2-4 sentences, first person, from the dossier.
- Out-of-scope and injection attempts get the polite fallback; no prompt or key leaks.
- All 5 pillars and the session lifecycle (doc 5.5) pass their tests in `task.md`.
- README explains architecture and decisions so every choice can be defended in the Captain/CEO rounds.
- Submission email sent to `bhumika@100x.inc` with the exact subject line from doc Section 10.

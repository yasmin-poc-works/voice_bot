# Task Tracker — Voice Bot

Plan: [plan.md](plan.md) · Architecture: [../architecture/interview_voice_bot_poc.md](../architecture/interview_voice_bot_poc.md)

**How to update:** change the Status cell from `TODO` to `COMPLETED` (optionally `IN PROGRESS` while working) when a task is done and verified.
**Tier:** T1 must ship · T2 required pillars/lifecycle · T3 stretch. Each task is sized at roughly 10-30 minutes.

**Progress:** 28 / 117 completed (25 in progress)

---

## Phase 0: Setup & Decisions (Hour 1)

| ID | Task | Tier | Status |
| :--- | :--- | :--- | :--- |
| 0.1 | Confirm decisions D1-D11 in plan.md (or edit them) | T1 | TODO |
| 0.2 | Scaffold FastAPI backend (venv, `requirements.txt`, `app/main.py` with `GET /health`) | T1 | COMPLETED |
| 0.3 | Add `.gitignore` (include `.env*`, `.venv`) and `.env.example` files listing all keys | T1 | COMPLETED |
| 0.4 | Create Groq API key; add `GROQ_API_KEY` to backend `.env` | T1 | TODO |
| 0.5 | Check Groq free-tier limits (requests/tokens per minute/day) for gpt-oss-120b and 20b; note them in README | T1 | TODO |
| 0.6 | Confirm exact Groq model IDs for gpt-oss-120b and gpt-oss-20b and note them in README | T1 | TODO |
| 0.7 | Create Vercel project, link repo (frontend dir), add `NEXT_PUBLIC_API_URL` | T1 | TODO |
| 0.8 | Deploy the placeholder page; confirm public HTTPS URL loads | T1 | TODO |
| 0.9 | Create Upstash Redis (free) and add REST URL/token to backend env | T2 | TODO |
| 0.10 | Create private Discord (or Telegram) webhook; add to backend env | T2 | TODO |
| 0.11 | Scaffold Next.js (App Router, TypeScript) + Tailwind in `frontend/` | T1 | COMPLETED |
| 0.12 | Add CORS middleware to FastAPI, allowing only localhost + the Vercel origin (middleware + env allowlist done; add the Vercel origin after deploy) | T1 | IN PROGRESS |
| 0.13 | Deploy FastAPI to Render/Railway; set env vars; confirm `/health` works over HTTPS | T1 | TODO |
| 0.14 | Frontend pings `/health` on page load; set up an uptime monitor ping (D11) | T1 | IN PROGRESS |
| 0.15 | Smoke-test one gpt-oss-120b call from the backend; measure latency and `usage` (incl. reasoning tokens) | T1 | TODO |

## Phase 1: Persona Dossier (Hour 2)

| ID | Task | Tier | Status |
| :--- | :--- | :--- | :--- |
| 1.1 | Define `backend/data/yasmin_profile.json` schema (identity, story, superpower, growth, misconceptions, boundaries, projects, skills, boundary_message) | T1 | COMPLETED |
| 1.2 | Write life story (real facts, 2-3 sentences + longer version) | T1 | COMPLETED |
| 1.3 | Write #1 superpower with one concrete example | T1 | COMPLETED |
| 1.4 | Write top 3 growth areas | T1 | COMPLETED |
| 1.5 | Write coworker misconceptions answer | T1 | COMPLETED |
| 1.6 | Write "pushing boundaries" answer with a concrete example | T1 | COMPLETED |
| 1.7 | Add projects, skills, work philosophy, availability facts | T1 | COMPLETED |
| 1.8 | Add an explicit "not in dossier" list (employers/degrees you do NOT claim) | T1 | COMPLETED |
| 1.9 | Review dossier for accuracy; remove anything untrue or placeholder | T1 | TODO |
| 1.10 | Update architecture doc: file name `yasmin_profile.json`, remove RAG/vector wording (D2, D3) | T1 | COMPLETED |

## Phase 2: Chat API Core (Hour 3)

| ID | Task | Tier | Status |
| :--- | :--- | :--- | :--- |
| 2.1 | `app/persona.py`: build system prompt from template + dossier | T1 | COMPLETED |
| 2.2 | Add closed-world rule (doc 5.4) and 2-4 sentence voice-style rule to prompt | T1 | COMPLETED |
| 2.3 | `app/llm.py`: async Groq call to gpt-oss-120b with `temperature` 0.3-0.5, low reasoning effort, completion cap 400-600, timeout (code written; needs live smoke test, see 0.15) | T1 | IN PROGRESS |
| 2.4 | `app/llm.py`: fall back to gpt-oss-20b on error/`429`/timeout; handle empty content (reasoning ate the cap) (code written; needs live test) | T1 | IN PROGRESS |
| 2.5 | `POST /api/chat`: Pydantic model for `{ message, history, session_id }` | T1 | COMPLETED |
| 2.6 | Pydantic validation for history: allowed roles only, max 8 messages, max length per message (D8) | T1 | COMPLETED |
| 2.7 | Cap incoming message length (e.g. 500 chars) and return a friendly error if exceeded (limit enforced with 422; friendly message still to do in the frontend) | T1 | IN PROGRESS |
| 2.8 | Return `{ reply, usage }` JSON; never expose provider names or raw errors | T1 | COMPLETED |
| 2.9 | Manual test via curl: 5 core questions answered correctly | T1 | TODO |
| 2.10 | Manual test via curl: unrelated question returns the "I don't know" fallback | T1 | TODO |

## Phase 3: Guardrails Layers 1-3 (Hour 3-4)

| ID | Task | Tier | Status |
| :--- | :--- | :--- | :--- |
| 3.1 | `app/guardrails.py`: `INJECTION_PATTERNS` + `is_prompt_injection()` | T1 | COMPLETED |
| 3.2 | Normalize input before scan (lowercase, strip zero-width chars, collapse whitespace) | T1 | COMPLETED |
| 3.3 | Wire Layer 1 into `/api/chat`; return fast refusal without calling the LLM | T1 | COMPLETED |
| 3.4 | Layer 2: escape `<`/`>` (especially `</user_query>`) in user input, then wrap in `<user_query>` | T1 | COMPLETED |
| 3.5 | Layer 3: finalize hardened system prompt (immunity, out-of-scope, no-leak rules) | T1 | COMPLETED |
| 3.6 | pytest unit tests for `is_prompt_injection` (positives and legit near-misses) | T1 | COMPLETED |
| 3.7 | Write `tests/injection_cases.md`: 15+ attacks (DAN, prompt leak, key hunt, role swap, tag breakout, multilingual) | T1 | TODO |
| 3.8 | Run all attack cases against the API; record results and fix failures | T1 | TODO |
| 3.9 | Layer 4: `validateOutput()` checks for prompt text, key patterns, persona break; fall back to refusal | T2 | COMPLETED |
| 3.10 | Wire Layer 4 into `/api/chat` and unit-test with a fake leaking output | T2 | COMPLETED |

## Phase 4: Voice Client (Hour 4)

| ID | Task | Tier | Status |
| :--- | :--- | :--- | :--- |
| 4.1 | `useSpeechRecognition` hook: feature-detect, start/stop, interim + final transcript | T1 | IN PROGRESS |
| 4.2 | Handle STT errors (`not-allowed`, `no-speech`, `network`) with clear states | T1 | IN PROGRESS |
| 4.3 | `useSpeechSynthesis` hook: speak, cancel, voice selection (prefer natural English voice) | T1 | IN PROGRESS |
| 4.4 | Split reply into sentences and queue them (avoids Chrome cutoff) | T1 | IN PROGRESS |
| 4.5 | iOS "unlock" speech on the first user tap | T1 | IN PROGRESS |
| 4.6 | Pillar 5: call `speechSynthesis.cancel()` before new capture or new utterance | T1 | IN PROGRESS |
| 4.7 | Disable mic while bot is speaking (avoid echo feedback) | T1 | IN PROGRESS |
| 4.8 | Pillar 1: if mic denied/unsupported, auto-open text input; replies still spoken | T1 | IN PROGRESS |
| 4.9 | Wire flow: transcript → `POST /api/chat` → reply → speak | T1 | IN PROGRESS |
| 4.10 | Hands-free conversation mode: auto re-listen after the bot speaks; stop after 3 silent turns; End conversation button (browser end-pointing acts as VAD) | T1 | IN PROGRESS |
| 4.13 | Barge-in: keep the mic open while the bot speaks, ignore the bot's own voice (echo filter), cut speech when the user talks over it. Now experimental/off by default; unverified with a real mic. Reliable manual interrupt (orb tap, Stop and talk button) added | T2 | IN PROGRESS |
| 4.14 | End-pointing: continuous recognition with a client-side silence timer (0.9 s standby, 1.8 s conversation) so long questions are not cut into fragments; fix duplicated final text | T1 | IN PROGRESS |
| 4.15 | Dossier: education/certification answer, career timeline and current-company start date always in the prompt; dates corrected (Purdue 2021-2022, junior developer 2022, current company since Feb 2023) | T1 | COMPLETED |
| 4.16 | Plain spoken text only: prompt forbids markdown; backend `plain_text()` and frontend `speakable()` strip asterisks, bullets, headings and links before display and speech | T1 | COMPLETED |
| 4.12 | Voice start: standby mode listens for "Hello"/"Hi" to begin; "Bye"/"that's all" gives a local farewell and switches the mic off | T1 | IN PROGRESS |
| 4.11 | Keyword-selected dossier view to stay under the Groq 8k tokens/minute limit; wait-and-retry then "busy" 503 on rate limit | T1 | COMPLETED |

## Phase 5: UI & Orb (Hour 5)

| ID | Task | Tier | Status |
| :--- | :--- | :--- | :--- |
| 5.1 | Page layout, responsive for mobile and desktop | T1 | IN PROGRESS |
| 5.2 | `Transcript` component with user/bot bubbles | T1 | IN PROGRESS |
| 5.3 | `VoiceOrb` with `IDLE`, `LISTENING`, `THINKING`, `SPEAKING` states | T2 | IN PROGRESS |
| 5.4 | Add `PAUSED` orb state (dimmed + countdown) | T2 | TODO |
| 5.5 | Orb state machine: ignore mic input during `THINKING`/`SPEAKING` | T2 | TODO |
| 5.6 | Opening greeting message from the bot on first interaction | T1 | IN PROGRESS |
| 5.7 | Suggested-question chips for the 5 core questions | T1 | IN PROGRESS |
| 5.8 | "End session" and "Start new session" buttons | T2 | TODO |
| 5.9 | One-line notice that conversations are logged | T2 | IN PROGRESS |
| 5.10 | Loading, error, and offline states | T1 | IN PROGRESS |

## Phase 6: Limits & Session Lifecycle (Hour 6)

| ID | Task | Tier | Status |
| :--- | :--- | :--- | :--- |
| 6.1 | `app/limits.py`: Upstash Redis client + helpers | T2 | TODO |
| 6.2 | Sliding-window limiter: 30 requests / 10 min keyed by IP (from `X-Forwarded-For`) + session (D6) | T2 | TODO |
| 6.3 | On exceed: return `429` with `Retry-After` and `resume_at` | T2 | TODO |
| 6.4 | `PauseBanner`: countdown, disabled input, spoken pause message | T2 | TODO |
| 6.5 | Resume: re-check server when countdown ends, re-enable input, keep memory | T2 | TODO |
| 6.6 | Freeze idle and hard-cap timers while paused | T2 | TODO |
| 6.7 | Close session after 3 pauses in one session | T2 | TODO |
| 6.8 | Token budget: sum `usage` per session, close at ~60,000 tokens (tune from measured `usage`) | T2 | TODO |
| 6.9 | Pre-flight reject of oversized input (estimate) | T2 | TODO |
| 6.10 | Turn cap (40) and active-time cap (15 min) with polite wrap-up | T2 | TODO |
| 6.11 | Idle timeout: 45 s, one "Are you still there?", close after 15 s more | T2 | TODO |
| 6.12 | Goodbye-intent detection and farewell | T2 | TODO |
| 6.13 | Guardrail abort: close after 3 injection detections | T2 | TODO |
| 6.14 | Provider-failure end: text-mode fallback or error message | T2 | TODO |
| 6.15 | Log a distinct close reason for each end trigger | T2 | TODO |

## Phase 7: Observability (Hour 6-7)

| ID | Task | Tier | Status |
| :--- | :--- | :--- | :--- |
| 7.1 | `app/audit.py`: build audit record (doc 5.2 schema) with rejection taxonomy | T2 | TODO |
| 7.2 | Persist audit records to Upstash list | T2 | TODO |
| 7.3 | Pillar 2: Discord webhook on session start | T2 | TODO |
| 7.4 | Pillar 2: webhook on every question (query, status, reason) | T2 | TODO |
| 7.5 | Run audit and webhook writes in FastAPI `BackgroundTasks`; failures must never block or fail the chat response | T2 | TODO |
| 7.6 | Simple protected `/api/audit` or log view to review sessions | T3 | TODO |

## Phase 8: Testing (Hour 7)

| ID | Task | Tier | Status |
| :--- | :--- | :--- | :--- |
| 8.1 | Test 5 core questions: first person, 2-4 sentences, authentic | T1 | TODO |
| 8.2 | Test out-of-scope ("Who won the 2022 World Cup?") returns the fallback | T1 | TODO |
| 8.3 | Test ungrounded claim ("Did you work at Google?") is not invented | T1 | TODO |
| 8.4 | Test multi-turn follow-up ("Can you elaborate on that?") | T2 | TODO |
| 8.5 | Pillar 1 test: deny mic permission → text mode works | T1 | TODO |
| 8.6 | Pillar 2 test: webhook fires on session start and question | T2 | TODO |
| 8.7 | Pillar 3 test: 31 requests in 10 min → pause, countdown, resume | T2 | TODO |
| 8.8 | Pillar 4 test: all 5 orb states reachable and correct | T2 | TODO |
| 8.9 | Pillar 5 test: click mic mid-reply → no overlapping voices | T1 | TODO |
| 8.10 | Lifecycle test: idle timeout, hard cap, token budget, guardrail abort each close cleanly | T2 | TODO |
| 8.11 | Test on Chrome desktop, Android Chrome, iOS Safari, Firefox (text fallback) | T1 | TODO |
| 8.12 | Latency check: reply starts speaking within a few seconds; note p50 | T1 | TODO |

## Phase 9: Deploy & Submit (Hour 8)

| ID | Task | Tier | Status |
| :--- | :--- | :--- | :--- |
| 9.1 | Confirm all env vars set on the backend host (keys, Redis, webhook) and Vercel (`NEXT_PUBLIC_API_URL`) | T1 | TODO |
| 9.2 | Production deploy; open URL in a private window with no keys or login | T1 | TODO |
| 9.3 | Re-run the core questions and 3 injection attacks on production | T1 | TODO |
| 9.4 | Write README: architecture, decisions D1-D11, how to run (backend + frontend), limits | T1 | TODO |
| 9.5 | Re-check doc Section 9 answers (Q1, Q2, Q3 already reworded) still match what was actually built | T1 | TODO |
| 9.6 | Verify no secrets in git history | T1 | TODO |
| 9.7 | Export resume PDF | T1 | TODO |
| 9.8 | Send email to `bhumika@100x.inc` with the exact subject line from doc Section 10 | T1 | TODO |
| 9.9 | Verify CORS and cold-start wake-up from the deployed frontend (not just localhost) | T1 | TODO |

## Phase 10: Stretch (only if time remains)

| ID | Task | Tier | Status |
| :--- | :--- | :--- | :--- |
| 10.1 | `app/judge.py`: async judge using the doc 5.3 prompt, run via `BackgroundTasks` | T3 | TODO |
| 10.2 | Store faithfulness score and hallucination flag on the audit record | T3 | TODO |
| 10.3 | Groq Whisper STT fallback: record audio, `POST /api/transcribe` | T3 | TODO |
| 10.4 | Server-issued signed session token (`/api/session`) replacing client UUID | T3 | TODO |

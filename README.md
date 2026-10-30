# Yasmin Iqbal: Voice Interview Bot

A voice bot that answers interview questions as **Yasmin Iqbal** (AI-focused backend engineer), built for the 100x AI Agent team assessment. An interviewer opens a web page, says "Hello", and talks to it. The bot answers from a fixed profile, declines out-of-scope questions politely, and resists prompt injection.

> **Status:** works locally; not deployed yet. Voice features have been checked in code and builds but still need real-browser testing (see [Known limits](#known-limits)).

## What it does

- **Voice in, voice out.** Browser speech recognition for input, browser speech synthesis for the reply. No audio is sent to this project's servers.
- **Hands-free conversation.** Say **"Hello"** to start, ask questions one after another, say **"Bye"** to end. The bot waits about 1.8 s of silence before treating your question as finished, so pauses mid-sentence don't cut it off.
- **Answers only from a profile** (`backend/data/yasmin_profile.json`). Anything not in the profile is declined or answered honestly ("I have not done that"). AI-agent work is described as learning and project experience, never as production.
- **Guardrails.** A regex filter for injection attempts (no AI call), escaped and sandboxed user input, a hardened prompt, and an output validator that blocks prompt leaks, keys and persona breaks.
- **Plain spoken text.** Markdown is stripped so the voice never reads out asterisks.
- **Fallbacks.** Text input if the mic is unavailable or denied, a second model if the first fails, and a "busy, ask again in a few seconds" message on rate limits.

## Architecture

```
Browser (Next.js)                         Backend (FastAPI)                    Groq
 Web Speech STT ──text──▶  POST /api/chat ──▶ 1. injection regex (no LLM)
 Web Speech TTS ◀─reply──                      2. escape + <user_query> sandbox
                                               3. persona prompt + selected dossier sections
                                               4. gpt-oss-120b, fallback gpt-oss-20b  ──▶ Groq API
                                               5. output validator + markdown strip
```

| Layer | Choice |
| :--- | :--- |
| Frontend | Next.js (App Router), TypeScript, Tailwind |
| Backend | FastAPI (Python 3.12), Pydantic |
| LLM | Groq-hosted `openai/gpt-oss-120b` (primary), `openai/gpt-oss-20b` (fallback). Verify exact IDs in the Groq console. |
| Speech | Browser Web Speech API (Chrome or Edge recommended) |

**Why only some of the profile is sent each time:** Groq's free tier allows about 8,000 tokens per minute per model, and sending the whole profile cost about 4,500 tokens per request. Each request now includes always-needed facts (identity, honesty rules, timeline, education) plus only the sections the question touches (chosen by keyword), about 1,700 to 2,400 tokens in total.

## Run it locally

You need Python 3.12, Node 22 and a [Groq API key](https://console.groq.com).

**1. Backend**
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
copy .env.example .env        # then open .env and set GROQ_API_KEY
.\.venv\Scripts\python -m uvicorn app.main:app --reload --port 8000
```
Check http://localhost:8000/health returns `{"status":"ok"}`. Use `--reload` so code changes apply; a server started without it keeps running old code.

**2. Frontend** (second terminal)
```powershell
cd frontend
npm install
copy .env.example .env.local   # NEXT_PUBLIC_API_URL=http://localhost:8000
npm run dev
```
Open http://localhost:3000 in Chrome, allow the microphone, tap once anywhere on the page (browsers only let a page speak after a click), then say "Hello".

### Configuration (`backend/.env`)

| Variable | Purpose |
| :--- | :--- |
| `GROQ_API_KEY` | Required. Kept on the server only; never sent to the browser. |
| `PRIMARY_MODEL`, `FALLBACK_MODEL` | Model IDs (defaults: gpt-oss-120b and gpt-oss-20b). |
| `ALLOWED_ORIGINS` | Comma-separated frontend origins allowed by CORS. Add the deployed URL here. |
| `UPSTASH_REDIS_*`, `DISCORD_WEBHOOK_URL` | Reserved for rate limiting and alerts (not used yet). |

## Using the page

| Control | What it does |
| :--- | :--- |
| Say "Hello" / "Hi" | Starts a conversation (the page waits for this on load). "Hello, what is your superpower?" starts and asks at once. |
| Say "Bye" / "that's all" | Short local goodbye, then the mic stops completely. |
| Orb or **Start listening** | Start or restart without speaking. |
| **Stop and talk** / tap the orb while it speaks | Interrupts the bot and listens right away. This is the reliable way to interrupt. |
| Suggestion chips, text box | Ask without the mic. |
| "Experimental: interrupt by speaking" | Off by default. Lets you talk over the bot, but on laptop speakers the mic can hear the bot's own voice. Use headphones. |
| "Heard: …" line | Shows what the recognizer heard and whether it was sent or ignored. |

## Tests

```powershell
cd backend ; .\.venv\Scripts\python -m pytest -q      # 73 tests, no API key needed (the LLM is mocked)
cd frontend ; npm run lint ; npm run build
```
The backend tests cover the injection filter, output validator, markdown stripping, history validation, topic selection, rate-limit retry, CORS and the dossier's dates. They do **not** call Groq. Live behaviour was checked separately by hand.

## Project layout

```
backend/
  app/            main.py, config.py, schemas.py, persona.py, guardrails.py, llm.py, routes/chat.py
  data/           yasmin_profile.json   (the only source of facts about Yasmin)
  tests/
frontend/src/
  app/page.tsx    conversation logic and UI
  components/     VoiceOrb, Transcript
  hooks/          useSpeechRecognition, useSpeechSynthesis
  lib/            api.ts, echo.ts, speakable.ts
docs/
  architecture/   interview_voice_bot_poc.md (the spec), voice_chat_bot_architecture.md (production target, not built)
  implementation_plan/   plan.md, task.md (status of every task)
```

## Known limits

- **Not tested with real microphone and speakers yet.** Speech behaviour (end-of-question timing, wake word, goodbye) is built and type-checked but needs a real-browser pass.
- **Voice interruption is experimental.** It compares what the mic hears with the bot's own sentence, which is a heuristic, not true voice-activity detection with echo cancellation. Use the Stop button or headphones.
- **Browser support.** Chrome and Edge work best. Firefox has no speech recognition, so typing is used. Phones may lower speaker volume while the mic is open, and continuous recognition can repeat words on some Android versions.
- **Free-tier limits.** Rapid back-to-back questions can still be rate limited (the bot waits and retries once, then asks you to try again in a few seconds). Both models share one Groq account, so a Groq-wide outage stops the bot.
- **Not built yet:** per-session rate limiting and pause, token budget, session timeouts, Discord alerts, audit log, and the background answer-checking judge. These are planned in [task.md](docs/implementation_plan/task.md). Deployment is also still to do.
- The mic stays open in standby so the bot can hear "Hello"; the browser shows its recording indicator.

## Documentation

- [Architecture and design decisions](docs/architecture/interview_voice_bot_poc.md)
- [Implementation plan](docs/implementation_plan/plan.md) and [task tracker](docs/implementation_plan/task.md)
- [Production target architecture](docs/architecture/voice_chat_bot_architecture.md) (not part of this build)

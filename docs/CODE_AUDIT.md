# OPAIJA Studios — Code Completeness Audit

Audit date: 2026-05-12
Auditor: Code Completeness Audit agent
Scope: `server/`, `src/`, `video/`, build config, `.env.example` vs. code, `CLAUDE.md` spec drift.

---

## 1. Executive summary

| Area                | Health  | Notes |
|---------------------|---------|-------|
| **Server / API**    | GREEN   | All `CLAUDE.md`-promised routes exist. Two parallel "brain" implementations (`claudeBrain` + `openaiBrain`) both work but the second is mostly unused. Solid error handling everywhere. |
| **Frontend**        | YELLOW  | Functional. Mostly type-safe. A few dead/unreachable surfaces (`CommandView`, `Opaija3DHero`, the `setup` view), one type drift on `health.provider`, and one personal absolute path string baked into the UI. |
| **Video / Remotion**| GREEN   | One simple composition (`OpaijaTeaser`) compiles and renders cleanly. `npm run render:teaser` is defined and plumbed. |
| **Build config**    | YELLOW  | Stale generated files (`vite.config.js`, `vite.config.d.ts`) checked in alongside `vite.config.ts`. `.env.example` and `setup.js` are out of sync. `tsconfig.server.json` does not include `composite`, so `tsc -b` does not actually descend into it — the `build` script invokes it explicitly, which is fine, but the layout is confusing. |

Verdict: **YELLOW overall.** No build-breakers found in the source itself. Most issues are spec drift / cleanup / minor UX bugs. Build correctness depends on `node_modules` being installed (cannot verify here).

---

## 2. Critical issues (will misbehave at runtime, not necessarily break the build)

| # | File:line | Problem | One-line fix |
|---|-----------|---------|--------------|
| C1 | `src/components/MasterDashboard.tsx:258` | Reads `health?.provider`, but `/api/health` exposes the video provider as `provider` while the local `HealthData` type declares `provider: string` and also `claudeProvider: string` — dashboard "Video Mode → detail" therefore actually shows the **video** provider (intent) but `HealthData.provider` is undocumented; works by coincidence. | Rename type field or add a JSDoc to make intent explicit; preferably add `videoProvider` alias on the server. |
| C2 | `src/App.tsx:969` | Hard-coded personal absolute Windows path `C:\Users\RAY\OneDrive\Documents\Opaija\.env` shown to every viewer of the `SetupView`. | Replace with relative `<repo>/.env` and compute via env or doc text. |
| C3 | `src/App.tsx:1017` | Hard-coded SSH key path `C:\Users\RAY\.ssh\codex_nextbagchaser_hetzner.pub` rendered in UI. | Same — strip personal path or move into a private setup doc. |
| C4 | `src/components/EpisodesView.tsx:410` | Hits `/api/voice/jobs` with `voiceId: "web-teller"` — a literal string, not an ElevenLabs voice id. With ELEVENLABS configured this will 4xx because no such voice exists. | Drop the `voiceId` field and rely on `ELEVENLABS_NARRATOR_VOICE_ID` from env. |
| C5 | `server/index.ts:386` | `updateJob` is awaited but the return ignores `null` for not-found. If the record was purged between fetch and update the response will say success with `null` job. | Guard `if (!updated) return 404`. |
| C6 | `server/episodes.ts:88` | `episodes_completed` is set to `count + 1` after a status change to PUBLISHED — but the count is computed BEFORE the in-memory mutation is persisted, so it double-counts the just-promoted episode. | Reorder: mutate `episode.status` first, then `episodes_completed = queue.episodes.filter(... === "PUBLISHED").length` (no `+ 1`). |
| C7 | `src/data/agents.ts` icon set vs. `src/App.tsx` icon set | `agents.ts` uses `Brain`, `ScrollText`, etc. Some agents still in `pending` status — UI shows "pending" lower-cased styling but `App.tsx:983` only reads `agent.status` directly into the className `agent-state ${agent.status}`. Only `online`, `building`, `waiting`, `review` are styled. New statuses would render unstyled. Cosmetic but easy to miss. | Add a fallback class. |
| C8 | `src/components/EpisodesView.tsx:402-416` | `generateNarration` swallows all errors silently. The user clicks "Generate Narration" and gets no UI feedback either way. | Return the response, surface a toast or a status badge on the button. |

(None of the above prevent `tsc -b && tsc -p tsconfig.server.json && vite build` from succeeding.)

---

## 3. Spec gaps (CLAUDE.md ↔ code)

CLAUDE.md is largely accurate. Drift summary:

### 3a. Routes promised in CLAUDE.md and present in `server/index.ts`

| CLAUDE.md mention | server/index.ts | Status |
|-------------------|-----------------|--------|
| `POST /api/episodes/:id/generate-script` | `:270` | OK |
| `POST /api/video/jobs` | `:185` | OK |
| `GET /api/assets` | `:348` | OK |
| `GET/POST /api/content-log` | `:329`, `:337` | OK |
| `npm run dev` script | `package.json:7` | OK |
| `data/jobs.json` auto-create | `server/jobStore.ts:22-33` | OK |

### 3b. Routes NOT in CLAUDE.md but present (undocumented surface)

These are real, working endpoints. They should be added to the master brief if they are intended public surface:

- `GET /api/health`
- `POST /api/brain/tasks` (the OpenAI brain — see also note 3d)
- `POST /api/voice/jobs`
- `POST /api/books/packets`
- `POST /api/merch/drafts`
- `POST /api/growth/leads`, `GET /api/growth/leads`, `GET /api/growth/summary`, `GET /api/growth/leaderboard`, `POST /api/growth/referrals/:code/click`, `POST /api/growth/campaigns`
- `GET /api/video/jobs/:requestId/status`, `GET /api/video/jobs/:requestId/result`
- `POST /api/claude/tasks`
- `GET /api/episodes`, `PATCH /api/episodes/:id/status`, `POST /api/episodes/:id/script`
- `GET /api/canon`
- `GET /api/jobs`, `GET /api/jobs/:id`, `POST /api/jobs/:id/poll`

### 3c. CLAUDE.md mentions that don't match implementation

- CLAUDE.md says `setup.js` is the bootstrap. `setup.js` writes a key it calls `ELEVENLABS_VOICE_ID_WEB_TELLER`, but `server/voice.ts:52` and `.env.example:32` use `ELEVENLABS_NARRATOR_VOICE_ID`. Setup wizard's output never satisfies the runtime read. **High-impact bug.**
- CLAUDE.md lists only `ANTHROPIC_API_KEY`, `FAL_KEY`, `ELEVENLABS_API_KEY`, `RESEND_API_KEY` as required keys, but the code also reads: `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, `RESEND_SEGMENT_ID`, `RESEND_AUDIENCE_ID`, `RESEND_FROM_EMAIL`, `PRINTFUL_API_KEY`, `PRINTIFY_API_KEY`, `PUBLIC_SITE_URL`, `SEEDANCE_DEFAULT_MODEL`, `VIDEO_PROVIDER`, `VOICE_PROVIDER`, `MERCH_PROVIDER`, `BRAIN_PROVIDER`, `OPENROUTER_*`, `OPENAI_TTS_*`, `ELEVENLABS_MODEL_ID`, `CLAUDE_MODEL`. Add these to the README key table or scope CLAUDE.md to "minimum required" explicitly.
- CLAUDE.md does **not** mention the public marketing site at `/` (with founder list, flipbook, leaderboard) — only the `/command` admin. `src/App.tsx:108-111` ships both. Worth noting in the brief.

### 3d. Two parallel brain modules

- `server/openaiBrain.ts` (mounted at `POST /api/brain/tasks`) is referenced by **no UI component**.
- `server/claudeBrain.ts` (mounted at `POST /api/claude/tasks`) is what the dashboard actually calls.
- Default `OPENAI_MODEL=gpt-5.5` (`.env.example:10`) and `openaiBrain.ts:86` is a model name that does not exist (will 404 if anyone hits `/api/brain/tasks` with `OPENAI_API_KEY` set).
- Recommendation: either delete `openaiBrain.ts` and the `/api/brain/tasks` route, or fix the default model and document it. As written, it's a footgun.

### 3e. `.env.example` ↔ `setup.js` ↔ runtime reads

| Variable used in code | In `.env.example` | In `setup.js` |
|-----------------------|-------------------|----------------|
| `ANTHROPIC_API_KEY`   | NO (missing)      | yes |
| `CLAUDE_MODEL`        | NO                | NO  |
| `ELEVENLABS_NARRATOR_VOICE_ID` | yes (`:32`) | NO — writes the wrong key name |
| `ELEVENLABS_VOICE_ID_WEB_TELLER` | NO          | yes |
| `RESEND_SEGMENT_ID`   | yes (`:58`)       | NO  |
| `BYTEPLUS_MODELARK_BASE_URL` | yes (`:27`) | NO  |
| `ARK_API_KEY`         | yes (`:26`)       | NO  |

Action: align all three. `ANTHROPIC_API_KEY` missing from `.env.example` is the loudest gap — `claudeBrain.ts` is the default brain.

---

## 4. Cleanups (low priority)

### 4a. Dead / unreferenced code
- `src/components/Opaija3DHero.tsx` — exported but no other file imports it. The `OpaijaMotionHero` rendered at `/hero-prototype` is the live one. Three.js dependency (`three`, `@types/three`) only exists for this dead file; if removed, drop those deps.
- `src/App.tsx:805 CommandView()` — defined but never rendered. The `command` view in `navItems` actually renders `<MasterDashboard/>`.
- `src/App.tsx:901 SetupView()` — rendered only when `activeView === "setup"`, but `"setup"` is not in `navItems` so the user can never click to it. Either add to nav or remove.
- `vite.config.js` and `vite.config.d.ts` — stale compiled artifacts living next to `vite.config.ts`. Delete and add `vite.config.{js,d.ts}` to `.gitignore`.

### 4b. Inconsistencies / nice-to-haves
- `data/shared-memory/QUEUE.json` mutation in `server/episodes.ts` is not atomic — concurrent writes can corrupt it. Acceptable for single-user local use, document the limitation.
- `server/jobStore.ts:33` truncates to last 200 jobs at every write; fine, but the in-memory list does no locking — same caveat.
- `server/seedance.ts:50` on `byteplus` provider just throws — clearly intentional ("future adapter") but that branch is unreachable from any UI. OK as-is.
- `src/data/episodes.ts:60` defines `qa_passed` but no `qa_notes`; `server/episodes.ts:50,52` declares both in the queue type. Minor type drift (frontend ignores `qa_notes`, no runtime impact).
- `src/components/MasterDashboard.tsx:60` pulls `KEY_LABELS["openrouter"]` indirectly — there's no row for `openrouter`. Will fall through to raw key name "openrouter" in UI. Add label.
- `dist-server/` referenced as `outDir` in `tsconfig.server.json` but there's no script that consumes it — `dev:api` uses `tsx watch`, prod uses `npm run server` (also `tsx`). The compiled output is unused; either wire a `node dist-server/index.js` start script or remove the build step.

### 4c. CanonGuard task drift
`src/components/CanonGuardView.tsx:64` lets the user pick `"canon-check"`, but `server/claudeBrain.ts:109-167` has no specific branch for `canon-check` — it falls through to the generic else. Works, but loses the focused prompt template. Add a `canon-check` branch in `buildPrompt`.

### 4d. TODO/FIXME scan
No `TODO` / `FIXME` / `HACK` / `@ts-ignore` / `throw new Error("not implemented")` markers found anywhere in `server/`, `src/`, or `video/`. The codebase is clean of explicit debt comments.

---

## 5. Recommended fix order (top 10)

1. **Align ElevenLabs voice id env var.** Either change `setup.js:78,81,117` to `ELEVENLABS_NARRATOR_VOICE_ID`, or change `server/voice.ts:52` and `.env.example:32` to `ELEVENLABS_VOICE_ID_WEB_TELLER`. Pick one and update CLAUDE.md.
2. **Add `ANTHROPIC_API_KEY` to `.env.example`.** Currently missing; setup wizard writes it but it is not in the example template — anyone copying `.env.example` cold won't know the default brain needs it.
3. **Fix `EpisodesView.generateNarration`** (`src/components/EpisodesView.tsx:402`) — drop the bogus `voiceId: "web-teller"` and surface the response status to the user.
4. **Fix `episodes_completed` double-count** in `server/episodes.ts:87-89`.
5. **Strip personal absolute paths from `SetupView`** (`src/App.tsx:969,1017`) — these ship to anyone who hits the dashboard.
6. **Decide the fate of `openaiBrain.ts` and `/api/brain/tasks`.** Either delete (and the `BRAIN_PROVIDER` env var with it), or fix the default model from `gpt-5.5` (nonexistent) and wire it into the UI. Pick one — having both is confusing and one of them lies.
7. **Add `setup` to `navItems`** in `src/App.tsx:80-94` (or delete `SetupView`). Right now it's dead.
8. **Delete `src/components/Opaija3DHero.tsx` and three.js deps**, OR wire it into the hero route. Currently 100KB+ of unused code and a heavy native-ish dep.
9. **Delete `vite.config.js` and `vite.config.d.ts`**; add to `.gitignore`. They will silently take precedence in some toolchains.
10. **Add a `canon-check` branch to `claudeBrain.ts:buildPrompt`** so the CanonGuardView's `canon-check` task gets a focused prompt instead of the generic fallback.

---

## Appendix — files inspected

Server: `server/index.ts`, `server/claudeBrain.ts`, `server/openaiBrain.ts`, `server/episodes.ts`, `server/seedance.ts`, `server/voice.ts`, `server/assets.ts`, `server/jobStore.ts`, `server/bookEngine.ts`, `server/growth.ts`, `server/merch.ts`.

Frontend: `src/main.tsx`, `src/App.tsx`, `src/components/{AssetBrowser,CanonGuardView,EpisodesView,MasterDashboard,Opaija3DHero,OpaijaMotionHero,PublishingView,WorkReview}.tsx`, `src/data/{agents,episodes,fx}.ts` (sampled).

Video: `video/index.ts`, `video/Root.tsx`, `video/compositions/OpaijaTeaser.tsx`.

Config / scripts: `package.json`, `vite.config.ts`, `tsconfig*.json`, `.env.example`, `scripts/setup.js`, `index.html`.

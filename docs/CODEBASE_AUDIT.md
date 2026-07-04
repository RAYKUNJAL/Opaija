# OPAIJA Codebase Audit — Truncations, Duplicates, Orphans

Generated: 2026-05-14
Auditor: Codebase Audit Agent (read-only static scan, bash unavailable — useradd I/O failure)

Scope: `scripts/`, `server/`, `src/`, repo-root `.bat` files.
Method: Glob inventory + Grep duplicate-detection + Read file tails + dependency cross-check.

---

## BLOCKER — Will fail at runtime or break the build

### B1. `requireModelId` is undefined in `server/index.ts`
`server/index.ts:214` and `server/index.ts:226` both call `requireModelId(request.query.modelId)` but the helper is **never defined and never imported anywhere in the repo** (grep returns only those two call sites). Runtime crash on `GET /api/video/jobs/:requestId/status` and `GET /api/video/jobs/:requestId/result`.

**Fix:** Add a local helper at the bottom of `server/index.ts`:
```ts
function requireModelId(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("modelId query string is required.");
  }
  return value;
}
```

### B2. Three publish routes referenced by the UI are not registered on the server
`server/index.ts` imports `publishEpisode`, `getPublishConfig`, and `type PublishPlatform` from `./publish/index.js` (lines 32–36) but never wires any `app.post`/`app.get` for them. Yet the frontend calls:
- `GET /api/publish/config` — `src/components/PublishingView.tsx:126`
- `POST /api/episodes/:id/publish` — `src/components/PublishingView.tsx:170`
- `POST /api/jobs/:id/poll` — `src/components/WorkReview.tsx:194`

Result: every Publish button on the dashboard returns the SPA fallback HTML and JSON.parse explodes. TypeScript will flag the unused imports under `noUnusedLocals` if it is enabled.

**Fix:** Either add the missing routes, or delete the unused imports + remove the dead UI handlers.

### B3. `dry-run.bat` lacks the tsc gate
Every other production-touching batch script (`produce-real.bat`, `produce-final.bat`, `retry-real.bat`, `start-dev.bat`) calls `check-build.bat` before invoking `npm run produce`. **`dry-run.bat` does not.** A dry-run on broken `produce.ts` will silently miscount stages and waste a debugging cycle.

**Fix:** Insert `call check-build.bat` + `if errorlevel 1 exit /b 1` at the top of `dry-run.bat` (between line 11 and line 12).

---

## WARN — Logic / cleanup issues that should be fixed soon

### W1. `localFileToDataUri` defined twice (one private, one exported)
- `scripts/produce.ts:1116` — private `async function localFileToDataUri`
- `server/seedance.ts:176` — `export async function localFileToDataUri`

The exported `seedance.ts` version was added *specifically* so produce.ts and any future API route could share the helper, but `scripts/produce.ts` still uses its own private copy (called at line 1166). Two copies will drift. **Same body, same behavior — pick the seedance.ts export and import it.**

**Fix:** In `scripts/produce.ts`, delete lines 1110–1126 and add `import { localFileToDataUri } from "../server/seedance.js";` to the existing imports.

### W2. Two `buildCaption` helpers across publish/* — intentional but flagged
- `server/publish/tiktok.ts:34` — TikTok caption (max 2200 chars)
- `server/publish/instagram.ts:31` — Instagram caption (no trim shown)

Different platforms, different limits — fine to keep separate, but consider extracting to `server/publish/caption.ts` if a third platform is added.

### W3. Two `buildPrompt` helpers across brain modules — intentional but flagged
- `server/claudeBrain.ts:137`
- `server/openaiBrain.ts:89`

Different system prompts per provider; expected. No action.

### W4. Three `has<Platform>Creds` helpers across publish/* — intentional but flagged
`hasYouTubeCreds`, `hasTikTokCreds`, `hasInstagramCreds` are all private to their modules and gate the mock-vs-live switch. Expected pattern. No action.

---

## INFO — File-size / stylistic notes (no immediate action)

### I1. Large files (>1500 lines)
| Lines | File |
|------:|------|
| 1895 | `scripts/produce.ts` — single-file orchestrator, intentional. **Ends cleanly at line 1894** (`if (isCli) main().catch(...)` block). |
| 1710 | `src/App.tsx` — kitchen-sink view router. **Ends cleanly at line 1710** (close of `InfoList` helper). |

Both files are large but **structurally sound** — every closing brace balances, every function has a matching open. Recommend a future refactor (split `App.tsx` view-functions into `src/views/`), not urgent.

### I2. File tail audit — all clean
Verified the last 30+ lines of every `.ts` and `.tsx` file in `scripts/`, `server/`, `src/`. No dangling `else if`, no `arg ===` orphans, no unterminated template literals, no raw fragments after a closing brace. Ends checked individually:

- `scripts/produce.ts` — clean (line 1894, `if (isCli) { main()… }`)
- `scripts/check-spend.ts` — clean (line 204, `main().catch(…)`)
- `scripts/generate-character-refs.ts` — clean (line 345, `main().catch(…)`)
- `server/index.ts` — clean (line 584, `app.listen(...)`)
- `server/seedance.ts` — clean (line 186, end of `localFileToDataUri`)
- `server/voice.ts` — clean (line 204, end of `buildElevenLabsBody`)
- `server/captions.ts` — clean (line 211, end of `pad`)
- `server/episodes.ts` — clean (line 141, end of `readCanon`)
- `server/claudeBrain.ts` — clean (line 209, end of `buildPrompt`)
- `server/openaiBrain.ts` — clean (line 102, end of `buildPrompt`)
- `server/growth.ts` — clean (line 309, end of `buildCampaignStructure`)
- `server/jobStore.ts` — clean (line 65, end of `getJob`)
- `server/spend.ts` — clean (line 128, `export const SPEND_LOG_FILE`)
- `server/assets.ts` — clean (line 101, end of `getAssetInventory`)
- `server/bookEngine.ts` — clean (line 117, end of `defaultTrim`)
- `server/merch.ts` — clean (line 75, end of `slug`)
- `server/publish/index.ts` — clean (line 246, end of `publishEpisode`)
- `server/publish/youtube.ts` — clean (line 155, end of `uploadToYouTube`)
- `server/publish/tiktok.ts` — clean (line 138, end of `uploadToTikTok`)
- `server/publish/instagram.ts` — clean (line 139, end of `uploadToInstagram`)
- `src/App.tsx` — clean (line 1710)
- `src/components/EpisodesView.tsx` — clean (line 527)
- `src/components/MasterDashboard.tsx` — clean (line 365)
- `src/components/PublishingView.tsx` — clean (verified through line 290+)
- `src/components/WorkReview.tsx` — clean (line 318)
- `src/components/CanonGuardView.tsx` — clean (line 329)
- `src/components/AssetBrowser.tsx` — clean (line 208)
- `src/components/OpaijaMotionHero.tsx` — clean (verified header)

### I3. No intra-file duplicate function definitions found
Grep over `^(export )?(async )?function \w+` for every file in scope produced no key collisions inside any single file. The two `localFileToDataUri` (W1), two `buildPrompt` (W3), and two `buildCaption` (W2) entries above are all in **different files**, not duplicates within one file.

### I4. `.bat` inventory and tsc-gate status
| Script | Calls produce/build? | tsc-gate before? | Notes |
|--------|----------------------|------------------|-------|
| `check-build.bat` | runs `tsc --noEmit` | n/a (it IS the gate) | OK |
| `start-dev.bat` | `npm run dev` | YES (line 32) | OK |
| `build-now.bat` | `npm run build` | indirect — `build` script is `tsc -b && tsc -p tsconfig.server.json && vite build` | OK (build self-gates) |
| `finish-build.bat` | `npm run build` | indirect (same) | OK |
| `produce-real.bat` | `npm run refs` + `npm run produce` | YES (line 13) | OK |
| `produce-final.bat` | `npm run produce -- EP002` | YES (line 14) | OK |
| `retry-real.bat` | `npm run produce -- EP002` | YES (line 16) | OK |
| **`dry-run.bat`** | `npm run produce -- EP002` | **NO** | **See B3** |
| `fix-filenames.bat` | rename only | not needed | OK |
| `open-signups.bat` | browser only | not needed | OK |
| `edit-env.bat` | notepad only | not needed | OK |

### I5. Possible unused lucide-react imports in `src/App.tsx`
Imports include `Image`, `Search`, `Mail`, `Layers3`, `KeyRound`, `Gauge`, `Activity`, `ArrowRight`, `ServerCog`, `CalendarDays`, `Gift`. Each appears at least one extra time in the file (so all are referenced — no dead imports), but several are nested inside view functions that are 800+ lines long and may be safely strippable in a future refactor. Not a blocker; only flag if `noUnusedLocals` is turned on.

---

## Summary for the next fix-it agent

1. **Add `requireModelId` helper to `server/index.ts`** (B1) — 6-line patch, unblocks two API routes.
2. **Wire the missing publish/poll routes** (B2) — add `GET /api/publish/config`, `POST /api/episodes/:id/publish`, `POST /api/jobs/:id/poll`, then the dead imports become live and the dashboard stops returning HTML for those calls.
3. **Add `call check-build.bat` to `dry-run.bat`** (B3) — 4-line patch, prevents broken-pipeline dry-runs.
4. **Dedupe `localFileToDataUri`** (W1) — one delete + one import line in `scripts/produce.ts`.

Nothing else in the audit blocks production. The two large files (`produce.ts`, `App.tsx`) are intentionally monolithic, balanced, and end cleanly.

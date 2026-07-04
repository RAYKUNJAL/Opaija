# OPAIJA Production Pipeline

End-to-end runbook for producing an episode of *Blood of the Gayelle* with the
new agentic tooling. If you are new to the project, read `CLAUDE.md` first,
then come back here.

---

## Overview

```
                ┌─────────────────────────────────────────────────────┐
                │             scripts/produce.ts <EPxxx>              │
                └─────────────────────────────────────────────────────┘
                                          │
        ┌─────────┬─────────┬─────────┬───┴─────┬──────────┬─────────┬─────────┐
        ▼         ▼         ▼         ▼         ▼          ▼         ▼         ▼
     [1/7]     [2/7]     [3/7]     [4/7]     [5/7]      [6/7]     [7/7]    (delivery)
     parse     voice    prompts   clips    manifest    render    report
       │         │         │         │         │          │         │
       │         │         │         │         │          │         │
   QUEUE.json  Eleven   Claude    Seedance   merge      Remotion  cost +
   + script    Labs     Brain     2.0 via    audio +    composer  QA log
   markdown    + align  prompts   fal.ai     clips +
              JSON                           captions               out/EPxxx.mp4
```

Every stage logs in the form `[produce] [stage-N] <message>`. The dashboard
parses these to drive the progress bar.

---

## One-Time Setup

1. Install dependencies and copy environment template:
   ```powershell
   npm install
   node scripts/setup.js
   ```
2. Fill in `.env` with the four API keys (see `CLAUDE.md` for sources):
   - `ANTHROPIC_API_KEY`
   - `FAL_KEY`
   - `ELEVENLABS_API_KEY`
   - `ELEVENLABS_NARRATOR_VOICE_ID` (the Web-Teller voice)
   - `RESEND_API_KEY` (optional, for fan list)
3. Generate the 10 character reference images:
   ```powershell
   npm run refs
   ```
   This writes locked reference sheets to `public/assets/characters/refs/` for
   Seedance image-to-video conditioning. Re-run whenever a character sheet is
   updated.
4. Smoke-test the dev stack:
   ```powershell
   start-dev.bat
   ```
   Confirm `http://localhost:8787/api/health` shows all four providers as
   configured (not `mock`/`dry_run`).

---

## Per-Episode Flow

```powershell
npm run produce -- EP002
```

This walks the 7-stage pipeline below. The final artefact is
`out/EP002.mp4` plus a sidecar `out/EP002.report.json` with per-clip costs and
QA findings.

| # | Stage    | What happens                                                                                    | Inputs                                       | Outputs                                  |
|---|----------|--------------------------------------------------------------------------------------------------|----------------------------------------------|------------------------------------------|
| 1 | parse    | Read `QUEUE.json`, locate the episode, parse `generated_script` into beats and shot list         | `data/shared-memory/QUEUE.json`              | `out/<EP>/parsed.json`                   |
| 2 | voice    | Render Web-Teller narration with ElevenLabs; emit timed alignment JSON                            | parsed.json, `ELEVENLABS_*`                  | `out/<EP>/narration.mp3` + `.alignment.json` |
| 3 | prompts  | Claude Brain converts each beat into a canon-locked Seedance prompt                              | parsed.json, `OPAIJA_CANON.json`             | `out/<EP>/prompts.json`                  |
| 4 | clips    | Submit each prompt to Seedance 2.0 (fal.ai) and poll until rendered                              | prompts.json, `FAL_KEY`                      | `out/<EP>/clips/clip-NN.mp4`             |
| 5 | manifest | Build a Remotion-friendly manifest with timing, captions, audio offsets                          | alignment + clip durations                   | `out/<EP>/manifest.json`                 |
| 6 | render   | Run `remotion render` against `EpisodeVertical` (or `EpisodeHorizontal` with `--aspect=16:9`)     | manifest.json, `video/Root.tsx`              | `out/<EP>.mp4`                           |
| 7 | report   | Sum up Seedance + ElevenLabs costs, write QA log, advance episode status                          | jobs.json + stage logs                       | `out/<EP>.report.json`                   |

Default aspect is `9:16` (vertical, 1080×1920) to match Shorts/Reels/TikTok.
Pass `--aspect=16:9` for the 1920×1080 horizontal cut used on the YouTube
main channel.

---

## Three Commands You'll Actually Run

1. **Boot the dev stack** (one terminal, all day):
   ```powershell
   start-dev.bat
   ```
   Equivalent to `npm run dev` — boots the Vite UI and Express API.

2. **Produce a single episode**:
   ```powershell
   npm run produce -- EP002
   ```
   Or trigger the same flow from the dashboard: *Episodes → EP002 →
   Produce Episode*.

3. **Produce every planned episode** (loop, no babysitting):
   ```powershell
   for ($i = 1; $i -le 12; $i++) {
     $ep = "EP{0:D3}" -f $i
     Write-Host "==> $ep"
     npm run produce -- $ep
   }
   ```
   Skips work that's already cached (see resume patterns below).

---

## Resume / Re-Run Patterns

The producer caches each stage under `out/<EP>/`. Re-running is idempotent.

| Need                                            | Command                                              |
|-------------------------------------------------|------------------------------------------------------|
| Re-render only — script and clips are fine      | `npm run produce -- EP002 --from=render`             |
| Re-cut clips after a prompt edit                | `npm run produce -- EP002 --from=clips`              |
| New narration voice/version                     | `npm run produce -- EP002 --from=voice`              |
| Wipe everything and start clean                 | `npm run produce -- EP002 --force`                   |
| Test the composer without spending API credits  | `npm run produce -- EP002 --from=render --force`     |

`--from=<stage>` is exclusive: it skips earlier stages and reuses their cached
output. `--force` ignores the cache for every stage and pays full price.

---

## Troubleshooting

| Symptom                                                     | Likely cause                                              | Fix                                                                                                                  |
|-------------------------------------------------------------|-----------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------|
| `[stage-4] Seedance request timed out`                      | fal.ai queue backed up or clip prompt too long            | Re-run with `--from=clips`. If it repeats, shorten the prompt or split the beat into two shots.                       |
| `429 Too Many Requests` from ElevenLabs                     | Voice rate limit on free/dev tier                         | Wait 60s and re-run with `--from=voice`. Or upgrade the ElevenLabs plan.                                              |
| `FFmpegError: error while opening encoder` during render    | Remotion OOM on long-form (>5 min)                        | Pass `--concurrency=1` to `remotion render`, or migrate to Remotion Lambda — see Long-Form Caveats below.             |
| `Cannot find module 'dist/...'` when starting server        | Production build hasn't run                               | `npm run build` once, then `npm run dev` or `start-dev.bat`.                                                          |
| `Missing character reference: kai_baptiste.png`             | Refs not generated yet                                    | `npm run refs` and retry.                                                                                             |
| Render finished but lips are obviously out of sync          | Alignment JSON missing — old voice.ts cached the result   | Re-run `--from=voice` to regenerate `<audio>.alignment.json`.                                                         |
| `[stage-1] generated_script is empty`                       | Script generation never ran for this episode              | From the dashboard: *Generate Script with Claude*. Or `curl -X POST /api/episodes/EP002/generate-script`.             |
| `FAL_KEY is not configured`                                 | `.env` missing or process didn't pick it up               | Re-run `node scripts/setup.js`, restart the dev server.                                                               |
| Black frames at clip boundaries                             | Clip durations don't sum to manifest target               | `--from=manifest` to recompute, then `--from=render`.                                                                 |

---

## Cost Expectations Per Episode

Pulled from `docs/COST_MODEL.xlsx` — see that file for the line items.

| Format                  | Seedance Pro | Seedance Lite |
|-------------------------|--------------|---------------|
| Short (60–90s, current) | **~$15**     | **~$5**       |
| 30-min episode          | **~$345**    | **~$108**     |
| 60–90 min movie         | **~$692**    | **~$216**     |

A complete Season 1 (12 shorts) under Pro is ~$180. Switch to Lite for
storyboard passes and test cuts, then re-run final episodes on Pro.

ElevenLabs narration is roughly $0.30/min of audio on the Creator plan and is
included in the per-episode line above.

---

## Long-Form Caveats (30-min, 60-min, Movie)

Shorts work entirely on the local Remotion CLI. Long-form needs more care.

1. **Scene chunking.** Stage 4 (`clips`) groups shots into ~10s Seedance
   requests. A 30-minute episode becomes ~180 clips — that's six hours of
   queue time at one-clip-at-a-time. Parallelise with the `concurrency`
   setting in `scripts/produce.ts` (default 4). fal.ai will throttle past 10.
2. **Manifest sharding.** Stage 5 splits the manifest into 5-minute Acts
   so each render fits in 8 GB of RAM.
3. **Remotion Lambda.** Anything over ~5 minutes should render on AWS Lambda
   instead of the local machine. Once a long-form is on the schedule, add
   `REMOTION_AWS_*` keys to `.env` and set `RENDER_TARGET=lambda` in
   `scripts/produce.ts`. Lambda concurrency = 200, render time drops from
   hours to minutes. Costs ~$0.50 per minute of finished video, on top of
   Seedance.
4. **Audio bed.** Long-form needs a music bed under narration. Producer
   currently lays narration over silence; drop a music track at
   `public/assets/audio/beds/<EP>.mp3` and stage 5 will mix it.
5. **Continuity refs.** Image-to-video conditioning is essential for >2-min
   cuts. Make sure `npm run refs` is current before kicking off a long-form
   batch — otherwise faces drift.

---

## Publishing

The producer ends at `out/<EP>.mp4`. Distribution is still manual:

1. Move the MP4 into `public/assets/exports/`.
2. Pick captions from `out/<EP>/narration.alignment.json` (already SRT-shaped).
3. Upload to Shorts / Reels / TikTok with the captions from
   `episodes.caption_patois`.
4. Log the post:
   ```powershell
   curl -X POST http://localhost:8787/api/content-log `
     -H "Content-Type: application/json" `
     -d '{ "episodeId":"EP002", "platform":"youtube", "url":"https://..." }'
   ```
5. Advance the episode status to `PUBLISHED` from the dashboard.

A future agent (`scripts/publish.ts`) will automate steps 1–4 against the
YouTube Data API and Meta Graph API. Until then, hold the line manually.

---

*RHYTHM. ROOTS. RESISTANCE. THIS IS OPAIJA.*

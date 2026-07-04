# OPAIJA Cost Discipline Rules

> **Read this before any production task.** These rules are baked into the pipeline (`scripts/produce.ts`, `server/claudeBrain.ts`). Overrides exist but require explicit flags.

The ground truth for raw numbers lives in `docs/COST_MODEL.xlsx`. At Lean (default) settings a 75s vertical short costs **~$4.72** end-to-end. The same short on Pro is **~$14.62** — a 3.1× markup with negligible quality gain for short-form social.

---

## Quick reference

| Rule | Where it's enforced | Override |
|---|---|---|
| Default to Seedance Lite (720p) for verticals ≤90s | `scripts/produce.ts` (`resolveCostMode`, `stageClips`) | `--quality` or `COST_MODE=quality` |
| Use Pro only for 30-min+ episodes, hero shots, paid distribution | `scripts/produce.ts` auto-promote when runtime > 600s | `--quality` |
| Use Haiku 3.5 for canon QA (not Sonnet) | `server/claudeBrain.ts` model map | `CLAUDE_CANON_MODEL` env override |
| Always request ElevenLabs `with-timestamps` | `server/voice.ts` + `scripts/produce.ts` stageVoice | none — already free |
| Reuse character refs across episodes | `scripts/produce.ts` stagePrompts: pre-flight check on `public/assets/characters/refs/<key>/front.png` | `--regen-refs` (calls `npm run refs`) |
| Cap Seedance parallelism at 4 | `scripts/produce.ts` `CONCURRENCY = 4` | edit code (don't) |
| Hard rework cap (1.5× / 1.8× / 2.0×) | `scripts/produce.ts` rework counter check | env `REWORK_CAP_VERTICAL/EPISODE/MOVIE` |
| Skip canon-QA on human-approved scripts | `scripts/produce.ts` reads `human_approved: true` from frontmatter | always honored |
| Auto-delete intermediate clips after final render | `scripts/produce.ts` stage 7 | `KEEP_INTERMEDIATES=1` |
| `max_tokens` caps (2k QA / 4k script / 8k default) | `server/claudeBrain.ts` | none — caps are protective |
| Switch to ElevenLabs Pro at >330k chars/month | manual subscription decision | see thresholds below |
| Switch to Suno sub at >5 episodes/month with music | manual subscription decision | see thresholds below |

---

## Default cost mode per format

| Format | Default mode | Runtime trigger | Seedance tier |
|---|---|---|---|
| Vertical short (TikTok / Reels / Shorts) | `lean` | `runtimeSeconds <= 90` | Lite (`/fast`) everywhere |
| Long-form episode | `balanced` | `90 < runtimeSeconds <= 600` | Pro for first + last beat, Lite for middle |
| 30-min episode / movie | `quality` | `runtimeSeconds > 600` | Pro everywhere |

Override at the CLI:

```bash
# force lean even for a long episode (test render):
npx tsx scripts/produce.ts EP011 --lean

# force quality for a hero teaser:
npx tsx scripts/produce.ts EP001 --quality
```

The orchestrator prints the resolved mode at startup:

```
[produce] cost-mode=lean (default for runtime≤90s)
```

---

## Per-tool defaults

### Seedance 2.0 (fal.ai)
- **Default model:** `bytedance/seedance-2.0/fast/{mode}` (Lite). $0.06/sec.
- **Pro model:** `bytedance/seedance-2.0/{mode}` (no `/fast`). $0.19/sec — only used in `quality` mode or `balanced` first/last beat.
- **Resolution:** 720p (Lite ceiling). Pro can do 1080p; we don't request it unless rendering for theatrical/festival.
- **Concurrency:** capped at 4. fal queues can absorb more, but 4 keeps wallet impact predictable.
- **Env:** `SEEDANCE_DEFAULT_MODEL` overrides the auto-derived model id (use sparingly).

### Claude (Anthropic)
- **Script generation:** Sonnet 4.5 (`claude-sonnet-4-5`) — `max_tokens: 4000`.
- **Canon QA:** Haiku 3.5 (`claude-3-5-haiku-latest`) — `max_tokens: 2000`. ~12× cheaper, accuracy is fine because the rule set is closed.
- **Everything else:** Sonnet (fallback) — `max_tokens: 8000`.
- **Env overrides:** `CLAUDE_MODEL` (script), `CLAUDE_CANON_MODEL` (canon-check).

### ElevenLabs
- Always request `with-timestamps` endpoint — alignment data is free, captions stage reuses it.
- Voice settings locked: stability `0.52`, similarity `0.78`, style `0.24` (Web-Teller character).
- Model: `eleven_multilingual_v2` (Creator-tier compatible).

### Character references
- Stored in `public/assets/characters/refs/<key>/front.png` (and `side.png`, `action.png` if generated).
- **Pipeline never regenerates refs.** stage 3 (prompts) verifies refs exist; if any are missing, it errors with: `run \`npm run refs -- --char=<key>\` to seed them`.
- Regenerate intentionally with `npm run refs -- --char=<key>` or `--regen-refs` flag on `produce.ts`.

---

## Subscription thresholds (manual decisions)

| Service | Switch when | Why |
|---|---|---|
| ElevenLabs Creator → Pro | sustained > 330,000 chars/month | Pro flat $99/mo includes 500k chars; Creator pay-as-you-go beats $0.30/k after 330k = $99 |
| Suno (free → Pro $10/mo) | > 5 episodes/month using Suno music | Free tier credits run out; pay-per-track add-ons cost more than the sub |
| Apple iCloud / Google Drive storage | > 200 GB of intermediate clips kept | Wipe `clips/` regularly instead — see `KEEP_INTERMEDIATES` |
| Remotion Lambda render farm | > 20 renders/day or > 5 min/episode | Local render is free but blocks the box; Lambda is ~$0.0125/min compute |

These are documentation-only — no code change required to flip the switch.

---

## Override flags & env vars

| Flag / env | Effect |
|---|---|
| `--quality` | Force `cost-mode=quality` (Pro tier everywhere) |
| `--lean` | Force `cost-mode=lean` (Lite tier everywhere) |
| `--regen-refs` | Allow stage 3 to call the ref generator if refs are missing (otherwise: hard error) |
| `--force` | Re-run all stages regardless of cached artifacts |
| `--from=stage` | Resume from a specific stage |
| `COST_MODE=lean\|balanced\|quality` | Same as flag, but env-scoped |
| `KEEP_INTERMEDIATES=1` | Don't delete `public/episodes/<EPxxx>/clips/` after render |
| `REWORK_CAP_VERTICAL=1.5` | Hard cap on per-beat reworks for verticals (default 1.5× expected calls) |
| `REWORK_CAP_EPISODE=1.8` | Same for long episodes |
| `REWORK_CAP_MOVIE=2.0` | Same for movies |
| `CLAUDE_CANON_MODEL=...` | Override Haiku model for canon-check |
| `SEEDANCE_DEFAULT_MODEL=...` | Override auto-derived seedance model id |

---

## What NEVER to do

- **Do NOT** regenerate character refs every episode. They're locked. If the look needs to drift, regenerate the canon ref intentionally and commit it.
- **Do NOT** use Pro for B-roll, transitions, establishing shots, or any beat that's on screen < 1.5s.
- **Do NOT** run Sonnet for canon-check. Haiku passes the same JSON-schema-locked checks at ~1/12th the price.
- **Do NOT** keep intermediate clips past final render unless you're iterating. They're 5–60 MB each, 12 beats per episode, 12 episodes/season → 1–8 GB of dead weight per season.
- **Do NOT** rerun `produce.ts` without `--from=` after a successful render — you'll wipe the cached `clips/` and pay to regen.
- **Do NOT** request 1080p Seedance unless the destination is theatrical / festival / paid placement. Social platforms transcode down to 720p anyway.
- **Do NOT** request `generate_audio: true` from Seedance. We always mux narration ourselves; the in-clip audio is wasted spend and lower quality.
- **Do NOT** loosen `max_tokens` without measuring. Runaway QA outputs have hit 32k+ tokens in past projects.

---

## Monthly budget alarms

The dashboard's Master view rolls up estimated cost from `data/jobs.json` and per-episode reports. Set monthly alarms:

- **Yellow zone:** $250/mo — review whether mode promotions are accidental.
- **Red zone:** $500/mo — pause auto-batches and audit `produce.ts` invocations.

> **TODO:** `scripts/check-spend.ts` — daily/weekly aggregator across `data/jobs.json` + per-episode `report.json`. Not yet built. Until then, rely on the per-episode report card the orchestrator prints at stage 7.

---

## Verified cost expectations (Lean default, per `docs/COST_MODEL.xlsx`)

| Format | Lean (Lite) | Quality (Pro) | Δ |
|---|---|---|---|
| Vertical 75s | **$4.72** | $14.62 | 3.1× |
| 30-min episode | **$108** | $345 | 3.2× |
| Feature movie | **$216** | $692 | 3.2× |
| Per second | $0.06 | $0.19 | 3.2× |

If the per-episode report at stage 7 prints anything > 1.3× the Lean number above for a vertical, something promoted unexpectedly. Audit the stage logs for `cost-mode=quality` or `tier=pro`.

---

*RHYTHM. ROOTS. RESISTANCE. Spend like every dollar funds the next episode — because it does.*

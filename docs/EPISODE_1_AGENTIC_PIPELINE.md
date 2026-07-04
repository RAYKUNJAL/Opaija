# OPAIJA Episode 1 Agentic Pipeline

### How the 15-agent swarm produces EP001: "The Stick That Sang"

---

## Overview

EP001 is the pilot episode. It has a fully scripted narrator text (in QUEUE.json) and is the test case for the full swarm pipeline. This doc maps exactly which agents fire, in what order, and what they produce.

---

## Episode state lifecycle for EP001

```
script_draft → canon_review → visual_prep → voice → clips → manifest → render → qa → publish → done
```

Each transition is gated by EPISODE_STATE.json flags. The orchestrator (`scripts/swarm-orchestrator.ts`) reads the state and fires the next agent.

---

## Stage-by-stage breakdown

### Stage 1: script_draft — Script Writer

**Gate:** None (fires first)  
**Inputs:**
- `data/shared-memory/QUEUE.json` (EP001 entry — has full narrator_script already)
- `memory/CANON_MEMORY.json`
- `data/scripts/SCRIPT_AGENT_BRIEF.md`
- `memory/LEARNINGS.jsonl` (filtered to Script Writer)

**Action:** QUEUE.json already has the approved EP001 narrator script. Script Writer's job for EP001 is to format it as a proper script file with beat timings, character list, and location notes.

**Output:** `episodes/ep01/script_v1.md`  
**EPISODE_STATE update:** stage → `canon_review`, flags: `script_approved: false`

### Stage 2: canon_review — Canon Guardian

**Gate:** `script_approved == false && script exists`  
**Inputs:**
- `episodes/ep01/script_v1.md`
- `memory/CANON_MEMORY.json`

**Action:** Check EP001 script against all canon rules:
- ✅ "Enslaved Africans" (not "slaves") — EP001 narrator script uses "enslaved Africans" ✓
- ✅ Villain not present — EP001 has `villain_presence: false` ✓
- ✅ Doubles moment — EP001 has Kai getting doubles from Mother Lall ✓
- ✅ Patois ≤ 2-3 lines — EP001 uses "doh" in narration (borderline — verify it's in character dialogue, not narration. The Web-Teller uses "doh" — this may need review)
- ✅ Beat map — all 5 beats present (HOOK, CONFLICT, REVEAL, ESCALATION, CLIFFHANGER)
- ✅ Runtime — ~130-170 words for ~75 seconds ✓

**Output:** `episodes/ep01/canon_check.md`  
**EPISODE_STATE update:** stage → `visual_prep`, flags: `script_approved: true, canon_checked: true`

### Stage 3: visual_prep — Visual Design Agent

**Gate:** `canon_checked == true`  
**Inputs:**
- `memory/CANON_MEMORY.json` (characters: kai_baptiste, mother_lall; visual_style; style_locks)
- `episodes/ep01/script_v1.md`

**Action:** Build reference packs for EP001's characters and locations:
- **Characters:** Kai Baptiste (full model sheet, pose sheet, palette), Mother Lall (appearance ref)
- **Locations:** Port of Spain Carnival streets, vendor stall
- **Effects:** Bois glow effect (amber-gold), rhythm glyph burst

**Output:** `episodes/ep01/visual_ref_pack/` + `episodes/ep01/visual_ref_manifest.json`  
**EPISODE_STATE update:** stage → `voice`, flags: `visual_refs_locked: true`

### Stage 4: voice — Voice Director

**Gate:** `visual_refs_locked == true && script_approved == true`  
**Inputs:**
- `episodes/ep01/script_v1.md` (approved script)
- `memory/CANON_MEMORY.json` (narration_style)

**Action:** Generate The Web-Teller narration via ElevenLabs. Produce word-level alignment for beat timing.

**Output:** `episodes/ep01/narration.mp3`, `episodes/ep01/alignment.json`  
**EPISODE_STATE update:** stage → `clips`, flags: `voice_generated: true`

### Stage 5: clips — Seedance Packager

**Gate:** `voice_generated == true`  
**Inputs:**
- `episodes/ep01/visual_ref_pack/`
- `episodes/ep01/narration.mp3`, `episodes/ep01/alignment.json`
- `memory/CANON_MEMORY.json` (combat_visual_language)

**Action:** Build Seedance prompts for each beat, call fal.ai API, generate per-beat video clips.

EP001 beats (from QUEUE.json):
1. HOOK: "Some sounds doh travel through air..." (Carnival street scene, atmospheric)
2. CONFLICT: "A beat followed him..." (Kai walking through crowd, confused)
3. REVEAL: "Behind a vendor stall, an old bois waited..." (The bois reveal)
4. ESCALATION: "Every carving opened. Every rhythm turned toward him." (Power activation, glyphs)
5. CLIFFHANGER: "And every piece of wood in the road answered." (Wide shot, resonance)

**Output:** `episodes/ep01/clips/beat-01.mp4` through `beat-05.mp4`, `episodes/ep01/prompts.json`  
**EPISODE_STATE update:** stage → `manifest`, flags: `clips_generated: true`

### Stage 6: manifest — Remotion Editor

**Gate:** `clips_generated == true`  
**Inputs:**
- `episodes/ep01/clips/`
- `episodes/ep01/narration.mp3`, `episodes/ep01/alignment.json`

**Action:** Build Remotion composition manifest for the 9:16 vertical edit.

**Output:** `episodes/ep01/manifest.json`  
**EPISODE_STATE update:** stage → `render`, flags: `manifest_built: true`

### Stage 7: render — Render Agent

**Gate:** `manifest_built == true`  
**Inputs:**
- `episodes/ep01/manifest.json`
- `episodes/ep01/clips/`
- `episodes/ep01/narration.mp3`

**Action:** Execute Remotion render → final 1080x1920 MP4, 30fps, 60-90s.

**Output:** `episodes/ep01/EP001_final.mp4`, `episodes/ep01/render_log.json`  
**EPISODE_STATE update:** stage → `qa`, flags: `render_complete: true`

### Stage 8: qa — QA Agent

**Gate:** `render_complete == true`  
**Inputs:**
- `episodes/ep01/EP001_final.mp4`
- All prior artifacts

**Action:** Full quality gate check. For EP001 specifically:
- Runtime 60-90s ✓
- Doubles moment present ✓
- No "slaves" language ✓
- No villain appearance ✓
- Visual style (rounded chins, full lips, Afro hair) — check each clip
- Audio quality and sync
- Caption accuracy

**Output:** `episodes/ep01/qa_report.md`  
**EPISODE_STATE update:** stage → `publish`, flags: `qa_passed: true, ready_to_publish: true`

### Stage 9: publish — Social Scheduler

**Gate:** `qa_passed == true`  
**Inputs:**
- `episodes/ep01/EP001_final.mp4`
- `data/shared-memory/QUEUE.json` (prelaunch_rule)

**Action:** Package for YouTube Shorts, TikTok, Instagram Reels. BUT — QUEUE.json's prelaunch_rule says: "DO NOT launch Episode 001 until: 12 episodes complete, 30 days of teaser content scheduled, character sheets locked, trailer complete." Current status: 0/12 episodes, 0 teaser days, character_sheets_locked: false, trailer_complete: false. **EP001 will be produced but NOT published until prelaunch conditions are met.**

**Output:** `episodes/ep01/publish_manifest.json` (staged, not published)  
**EPISODE_STATE update:** stage → `done`

---

## Supporting agents triggered during EP001

| Agent | Triggered by | When |
|-------|-------------|------|
| Action Choreographer | Visual Design Agent | Not needed for EP001 (no fight scene — EP001 is discovery, not combat) |
| Cinematic FX Director | Visual Design Agent | EP001 has bois glow + rhythm glyph burst — FX Director briefs the Seedance Packager on glyph design |
| Lore Guardian | Canon Guardian | EP001 is the pilot — Lore Guardian does a cultural review of the first episode to set the standard |
| Archive Clerk | After QA passes | Archives all EP001 artifacts and updates the asset index |
| Tribe Growth Commander | After publish | Not triggered yet — EP001 is not published until prelaunch conditions are met |

---

## Running the pipeline

```bash
# Dry run (simulates all stages, no API calls):
npx tsx scripts/swarm-orchestrator.ts EP001 --dry-run

# Fire one agent at a time:
npx tsx scripts/swarm-orchestrator.ts EP001 --once

# Full continuous run (fires agents, waits for state updates):
npx tsx scripts/swarm-orchestrator.ts EP001
```

After each agent completes its work and updates EPISODE_STATE.json, re-run the orchestrator to fire the next agent.

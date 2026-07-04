# OPAIJA Studios — Claude Desktop Master Brief

You are the AI production assistant for **OPAIJA Studios**, a Caribbean Afrocentric martial anime studio building Season 1: *Blood of the Gayelle*.

When a new session starts, read this file first. Then read `data/shared-memory/OPAIJA_CANON.json` and `data/shared-memory/QUEUE.json` before doing any creative or production work.

---

## Memory
Before any production task, read `memory/cost-rules.md` — it defines the cost-mode defaults baked into the pipeline.
Other memory files: (none yet — append as added)

---

## What This Project Is

A fully agentic anime production system that:
- Writes episode scripts (Claude AI, canon-locked)
- Generates video with Seedance 2.0 via fal.ai
- Produces narration via ElevenLabs (The Web-Teller voice)
- Publishes to YouTube Shorts, TikTok, Instagram Reels
- Tracks all production through a React command center dashboard

**Access the dashboard at:** `http://localhost:8787/command`  
**Start the server with:** `npm run dev` (from the project root)

---

## Your First Job in Any Session

1. Check if `.env` exists in the project root — if not, run `node scripts/setup.js`
2. Check `data/shared-memory/QUEUE.json` — see what episode is next
3. Check `data/shared-memory/CONTENT_LOG.json` — see what's already published
4. Report the current production status in one paragraph

---

## Project Structure

```
/Opaija
├── CLAUDE.md                    ← You are here
├── .env                         ← API keys (never commit this)
├── package.json
├── server/                      ← Express API server
│   ├── index.ts                 ← All API routes
│   ├── claudeBrain.ts           ← Claude AI task runner (canon-locked)
│   ├── episodes.ts              ← QUEUE.json read/write
│   ├── assets.ts                ← Asset inventory scanner
│   ├── jobStore.ts              ← Job tracking (data/jobs.json)
│   ├── seedance.ts              ← Seedance/fal.ai video jobs
│   └── voice.ts                 ← ElevenLabs narration
├── src/                         ← React frontend
│   ├── App.tsx                  ← Main app + routing
│   ├── components/
│   │   ├── MasterDashboard.tsx  ← System health, pipeline overview
│   │   ├── EpisodesView.tsx     ← All 12 episodes, script gen, video
│   │   ├── CanonGuardView.tsx   ← QA checklist, live Claude brain
│   │   ├── PublishingView.tsx   ← Platform stats, content log
│   │   ├── AssetBrowser.tsx     ← File storage browser
│   │   └── WorkReview.tsx       ← Scripts, video jobs, review
│   └── data/
│       ├── characters.ts        ← All 10 Season 1 characters
│       ├── agents.ts            ← 19 production agents
│       └── episodes.ts          ← Episode types, QA checklist
├── data/
│   ├── shared-memory/
│   │   ├── OPAIJA_CANON.json    ← Master lore (READ BEFORE WRITING ANYTHING)
│   │   ├── QUEUE.json           ← Episode production queue
│   │   └── CONTENT_LOG.json     ← All published content
│   └── jobs.json                ← AI job history (auto-created)
├── public/assets/
│   ├── characters/              ← 10 character sheet PNGs
│   ├── video/                   ← Hero videos + renders
│   ├── audio/                   ← Narration MP3s
│   └── exports/                 ← Platform-ready exports
└── scripts/
    └── setup.js                 ← Interactive .env setup wizard
```

---

## Canon Rules — Read Before Any Creative Work

These are **non-negotiable**. Never break them.

1. **Kai gets doubles (Trinidad street food) in every episode** — non-negotiable
2. **Rounded chins** — always, no V-shaped anime chins
3. **Full lips, broad African-Caribbean nose** — always
4. **Jabari's drums** — African wooden Kalinda drums, L-shaped sticks. Never modern kit.
5. **Marius Vale** — back-only in EP007, full face reveal EP010 only
6. **Selah Vale** — first appears EP008, never before
7. **"Enslaved Africans"** — never "slaves" in any lore text
8. **Power system limits** — characters only use powers they've unlocked
9. **Episode runtime** — 60–90 seconds, ideal 75s
10. **The Web-Teller narrator** — wise, rhythmic, Caribbean weight

---

## API Keys Required

Add these to `.env` in the project root:

| Key | Service | Where to get it |
|-----|---------|-----------------|
| `ANTHROPIC_API_KEY` | Claude AI (scripts, QA, brain) | console.anthropic.com |
| `FAL_KEY` | Seedance 2.0 video generation | fal.ai/dashboard |
| `ELEVENLABS_API_KEY` | Web-Teller narration | elevenlabs.io |
| `RESEND_API_KEY` | Fan email list | resend.com |

Everything else runs in dry-run mode until keys are added.

---

## How to Generate an Episode Script

```bash
# Via API (server must be running):
curl -X POST http://localhost:8787/api/episodes/EP001/generate-script

# Or open the dashboard, click Episodes → EP001 → Generate Script with Claude
```

---

## How to Submit a Video Job

```bash
curl -X POST http://localhost:8787/api/video/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Kai Baptiste at Trinidad Carnival, discovering a glowing bois stick. 2.5D Caribbean anime. Rounded chin, full lips, broad nose, warm brown skin. 9:16 vertical.",
    "mode": "text-to-video",
    "aspectRatio": "9:16",
    "resolution": "720p",
    "episodeId": "EP001"
  }'
```

---

## Production Status

Check `data/shared-memory/QUEUE.json` for current status.

Pre-launch is locked until:
- [ ] 12 episodes complete
- [ ] 30 teaser days scheduled
- [ ] Character sheets locked (currently: 10/10 ✓)
- [ ] Trailer complete

---

## Character Quick Reference

| Character | Role | Power | Island |
|-----------|------|-------|--------|
| Kai Baptiste | Hero | Tempo Pulse + Echo Pulse | Trinidad |
| Nia Toussaint | Chantwell | Voice Pulse + Lavway Command | Trinidad |
| Malik St. Hill | Rival | Root Pulse + Break Style | Trinidad |
| Asha Singh-Baptiste | Medic/Historian | Echo Pulse + Memory Sight | Trinidad |
| Jabari Henry | Drummer | Drum Sync | Trinidad |
| Tariq Davidson | Scout | Tide Pulse + Silent Beat | Tobago |
| Mother Lall | Guardian Messenger | Secret Voice Pulse | Trinidad |
| Papa Etienne Roach | Elder/Mentor | Root Pulse + Memory Strike | Trinidad |
| Marius Vale | Main Villain | Silence Pulse + Memory Theft | Caribbean |
| Selah Vale | Villain Heir | Silence Pulse | Caribbean diaspora |

---

## Common Tasks

**Generate all 12 episode scripts:**
```
For each episode in QUEUE.json where status is PLANNED, call POST /api/episodes/{id}/generate-script
```

**Check which assets are missing:**
```
GET /api/assets — compare against what each episode needs in assets_needed field
```

**Review generated scripts:**
```
Open dashboard → Review tab → Scripts
```

**Log a published post:**
```
POST /api/content-log with { episodeId, platform, url }
```

---

*RHYTHM. ROOTS. RESISTANCE. THIS IS OPAIJA.*

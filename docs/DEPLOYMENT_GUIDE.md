# OPAIJA Studios — Real Deployment Guide

### Actual TypeScript/Node.js stack on Hetzner VPS (trini)

**Last deployed:** 2026-07-03  
**Server:** trini (5.78.105.83) — Ubuntu, 15GB RAM, 150GB disk  
**Stack:** Node.js + Express + Vite + React + Remotion + fal.ai (Seedance) + ElevenLabs + Anthropic Claude  
**Live URL:** https://opaija.com  
**Local API:** http://localhost:8787 (on server)

---

## What's actually deployed

| Component | Status | Location |
|-----------|--------|----------|
| Canon (source of truth) | ✅ Live | `data/shared-memory/OPAIJA_CANON.json` |
| Flattened canon for agents | ✅ Live | `memory/CANON_MEMORY.json` |
| 12-episode queue | ✅ Live | `data/shared-memory/QUEUE.json` |
| Agent roster (15 agents) | ✅ Live | `ops/agents/AGENT_ROSTER.yaml` |
| Swarm memory (3 layers) | ✅ Live | `memory/MESSAGE_BUS.jsonl`, `memory/LEARNINGS.jsonl`, `memory/CANON_MEMORY.json` |
| Swarm orchestrator | ✅ Built | `scripts/swarm-orchestrator.ts` |
| Production pipeline | ✅ Live | `scripts/produce.ts` (7-stage: parse → voice → prompts → clips → manifest → render → report) |
| Express API server | ✅ Running | pm2 process "opaija", port 8787 |
| React command center | ✅ Built | `dist/` served by Express |
| Seedance 2.0 (fal.ai) | ✅ Configured | `FAL_KEY` set, `VIDEO_PROVIDER=fal` |
| ElevenLabs narration | ✅ Configured | `ELEVENLABS_API_KEY` set, `VOICE_PROVIDER=elevenlabs` |
| Claude AI brain | ✅ Configured | `ANTHROPIC_API_KEY` set, brain via OpenRouter (kimi-k2) |
| Caddy reverse proxy | ✅ Active | Docker container, proxies opaija.com → 127.0.0.1:8787 |
| ffmpeg | ✅ Installed | `/usr/bin/ffmpeg` |
| pm2 process manager | ✅ Running | Auto-restarts on crash, saved for reboot |
| Character model sheets (PNG) | ⬜ Not yet | Need to generate and upload to `public/assets/characters/` |
| Publishing (YouTube/TikTok/IG) | ⬜ Mock mode | Adapters built, need OAuth credentials |

---

## Health check (verified live)

```bash
$ curl https://opaija.com/api/health
{
  "ok": true,
  "brainProvider": "openrouter",
  "brainModel": "moonshotai/kimi-k2",
  "provider": "fal",
  "voiceProvider": "elevenlabs",
  "keys": {
    "openai": true,
    "openrouter": true,
    "fal": true,
    "elevenlabs": true,
    "resend": true
  },
  "publicSiteUrl": "https://opaija.com",
  "seedance": "configured"
}
```

---

## How the server is set up

### Process management
- **pm2** runs `dist-server/index.js` as process "opaija"
- Auto-restarts on crash
- Saved with `pm2 save` for reboot persistence
- Logs: `pm2 logs opaija`

### Reverse proxy
- **Caddy** runs as a Docker container on ports 80/443
- Caddyfile at `/etc/caddy/Caddyfile`:
  ```
  opaija.com, www.opaija.com {
    reverse_proxy 127.0.0.1:8787
  }
  ```
- SSL is automatic via Caddy's Let's Encrypt integration
- Caddy proxies all traffic to the Express server on port 8787

### File layout on server
```
/var/www/opaija/
  .env                    ← API keys (never committed)
  dist/                   ← Built React frontend
  dist-server/            ← Built Express server
  data/shared-memory/     ← Canon, queue, content log
  memory/                 ← Swarm memory (MESSAGE_BUS, LEARNINGS, CANON_MEMORY)
  episodes/               ← Per-episode working state
  ops/agents/             ← Agent roster
  scripts/                ← Pipeline scripts (produce.ts, swarm-orchestrator.ts)
  server/                 ← Source: Express API, Seedance, voice, brain
  public/assets/          ← Character PNGs, video outputs
```

---

## Server operations

### Check server status
```bash
ssh trini "pm2 status opaija"
```

### View logs
```bash
ssh trini "pm2 logs opaija --lines 50"
```

### Restart server
```bash
ssh trini "pm2 restart opaija"
```

### Update deployment after code changes
```bash
# From local machine:
cd ~/OPAIJA
git add -A && git commit -m "your changes" && git push

# On server:
ssh trini "cd /var/www/opaija && git pull && npm ci && npm run build && pm2 restart opaija"
```

### Run the production pipeline for an episode
```bash
ssh trini "cd /var/www/opaija && npx tsx scripts/produce.ts EP001"
```

### Run the swarm orchestrator (agent-by-agent)
```bash
ssh trini "cd /var/www/opaija && npx tsx scripts/swarm-orchestrator.ts EP001"
```

---

## API keys in .env (on server)

| Key | Service | Status |
|-----|---------|--------|
| `FAL_KEY` | Seedance 2.0 via fal.ai | ✅ Set |
| `ANTHROPIC_API_KEY` | Claude AI brain | ✅ Set |
| `OPENAI_API_KEY` | Whisper captions | ✅ Set |
| `ELEVENLABS_API_KEY` | Web-Teller narration | ✅ Set |
| `ELEVENLABS_NARRATOR_VOICE_ID` | ElevenLabs voice ID | ✅ Set |
| `RESEND_API_KEY` | Email | ✅ Set |
| `PRINTFUL_API_KEY` | Merch | Empty (not needed yet) |

---

## What still needs doing

1. **Character model sheets** — generate PNG model sheets for all 10 characters and upload to `public/assets/characters/` on the server
2. **Publishing OAuth** — set up YouTube/TikTok/Instagram API credentials for auto-publishing (currently mock mode)
3. **Five-Part Power System approval** — review `OPAIJA_CANON_ADDENDUM_2.md` and approve/modify
4. **Run EP001 through the pipeline** — `npx tsx scripts/produce.ts EP001` on the server with real API keys

---

## Cost notes (real, not fabricated)

- **VPS:** Already paid (Hetzner, shared with other apps)
- **fal.ai Seedance:** Pay per clip (~$0.50-2.00 per clip depending on mode/length). EP001 has ~5 beats = ~$2.50-10
- **ElevenLabs:** ~$0.30 per 1000 characters. EP001 script is ~150 words = ~$0.05
- **Claude API:** ~$0.01-0.05 per script generation depending on model
- **Per episode total:** ~$3-15 depending on clip count and rework
- **Season 1 (12 episodes):** ~$36-180, not $275-870

These are estimates from the actual cost model in `docs/COST_MODEL.xlsx` and the spend tracker in `server/spend.ts`. The pipeline has a monthly budget cap (`MONTHLY_BUDGET_USD=500` in .env) that aborts if exceeded.

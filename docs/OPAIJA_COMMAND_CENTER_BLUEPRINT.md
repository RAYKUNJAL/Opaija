# OPAIJA Command Center Blueprint

## Mission

Build a commercial content-generating machine for `OPAIJA: Staff of Battle` that can support story development, character bibles, reference packs, video production, social posting, monetization, and future network/pitch assets from one source of truth.

## Operating Model

The command center has four layers:

1. Brain layer: Codex Brain plans, implements, assigns, checks memory, and keeps the local server/workspace moving.
2. Goose layer: creative story, art direction, lore, style, scripts, and episode continuity.
3. Paperclip layer: production management, file organization, render packets, captions, publishing checklists, and archive hygiene.
4. Revenue layer: social launch, YouTube packaging, merch hooks, franchise extensions, and pitch readiness.

## First Production Objective

Create a 30-day prelaunch runway before the pilot drops:

- 10 character reveal posts
- 21 curiosity/teaser shorts
- 12 vertical micro-episodes banked before public launch
- 1 narrator-led pilot script and shot list
- Character merch hooks attached to every recurring cast member

## Near-Term Build Order

1. Clean and normalize the master file into canon docs.
2. Complete full bibles for the ten Priority 1 Season 1 characters.
3. Complete bible passes for all ten loaded Priority 1 model sheets.
4. Convert every locked sheet into a Seedance reference pack.
5. Use OpenAI brain tasks to draft bibles, Seedance prompts, episode scripts, hooks, and style checks against the style memory.
6. Use ElevenLabs for controlled narrator audio and future character voice maps.
7. Use Remotion as the editing/render layer for shorts, captions, audio timing, thumbnails, and exports.
8. Write narrator-led pilot episode and first twelve vertical micro-episodes.
9. Build launch calendar, thumbnails, captions, and social hooks.
10. Wire live video provider automation after API keys are configured.

## Server Notes

This first version is a Vite React command center. It is ready to run locally or on a server with Node.js.

Commands:

```powershell
npm install
npm run dev
npm run build
```

The dev server binds to `0.0.0.0` so it can be reached from your local network or reverse-proxied on a server.

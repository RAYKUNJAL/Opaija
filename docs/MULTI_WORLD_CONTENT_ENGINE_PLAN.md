# Multi-World Content Engine Plan

## Goal

Turn the Opaija command center into a reusable content-build engine that can power multiple story worlds from one shared API/account stack.

The system should be cloned by changing the world pack, not rebuilding the platform.

## Architecture

### 1. Engine Core

Reusable across every story world:

- React command center
- Agent roster model
- OpenAI brain adapter
- Seedance 2.0 video adapter
- ElevenLabs voice adapter
- Remotion editing layer
- Amazon KDP book engine
- Digital reader/pass engine
- Episode-to-products workflow
- Shared asset packet standard
- Deployment scripts and environment variables

### 2. World Pack

Swapped per story world:

- World name and logline
- Style memory
- Character list
- Character sheets and references
- Lore rules
- Episode list
- Product formats
- Merch hooks
- KDP presets if different
- Voice map if different

Opaija is the first world pack.

## Clone Flow for a New Story World

1. Copy the engine repo.
2. Create a new world memory file in `ops/memory/`.
3. Replace `src/data/characters.ts` with the new cast.
4. Add character assets under `public/assets/characters/`.
5. Add style guide and world bible docs under `docs/`.
6. Keep `.env` provider keys the same if using the same OpenAI, fal/Seedance, and ElevenLabs accounts.
7. Run `npm install`, `npm run build`, and `npm run dev`.
8. Generate first packets: character bible, Seedance prompt, voiceover, teaser edit, and KDP page plan.

## Secret Strategy

API key values must not be saved into source files, docs, JSON memory, screenshots, or GitHub.

Use one shared provider account by setting the same environment variables on each deployed world:

- `OPENAI_API_KEY`
- `FAL_KEY`
- `ELEVENLABS_API_KEY`
- `ELEVENLABS_NARRATOR_VOICE_ID`

Local development uses `.env`.

Production should use the server host’s secret manager or environment variable settings.

## Reusable Output Pipeline

Each episode should create:

- `episode-script.md`
- `shot-list.md`
- `seedance-prompts.md`
- `voiceover-script.md`
- `render-manifest.json`
- `caption-pack.md`
- `social-posts.md`
- `kdp-book-packet.md`
- `digital-reader-manifest.json`
- `paid-pass-sample-pack.md`
- `asset-manifest.json`
- `qc.md`

## Long-Form Book Standard

The free flipbook is only a lead magnet. Commercial book products should be long enough to feel real:

- digital comic chapter: 32-48 pages
- manga chapter: 48-64 pages
- storybook: 24-40 pages
- coloring book: 48-72 pages
- artbook: 64-96 pages

The engine should generate sample pages for cold traffic, then route full products into the digital reader/pass system and KDP export queue.

## Recommended Repo Strategy

Keep this repository as the master engine until it stabilizes. Then create either:

1. One monorepo with `worlds/opaija`, `worlds/world-2`, etc.
2. One template repo for the engine and separate repos for each story world.

The cleanest long-term approach is:

- `content-engine-core` as a reusable template
- one repo per story world for assets and canon

That keeps huge art/video assets from making every world repo heavy.

## What Changes Per World

| Area | Engine Core | World Pack |
|---|---|---|
| API keys | Same env names | Same account values |
| Agents | Same roles | World-specific tasks |
| Style memory | Same schema | New style lock |
| Characters | Same data model | New cast |
| Video | Same Seedance adapter | New prompts/assets |
| Voice | Same ElevenLabs adapter | New voice map |
| Editing | Same Remotion templates | New footage/images/audio |
| Books | Same KDP engine | New page plans/art |

## First Five-World Setup

For each new world, create:

- `ops/memory/<world>-style-memory.json`
- `docs/<WORLD>_STYLE_GUIDE.md`
- `docs/<WORLD>_WORLD_BIBLE.md`
- `public/assets/<world>/characters/`
- `public/assets/<world>/episodes/`
- `src/data/worlds/<world>.ts`

Then the command center can later add a world switcher instead of needing five separate apps.

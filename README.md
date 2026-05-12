# OPAIJA Command Center

Local command center for building the Opaija content machine: character bibles, agent roles, production pipeline, shared memory, and launch planning.

## Run

```powershell
npm install
npm run dev
```

Open the local URL Vite prints in the terminal. The app binds to `0.0.0.0`, so it can also run on a server behind a reverse proxy.

## Project Structure

- `src/` - React command-center app
- `public/assets/characters/` - imported character sheets
- `docs/` - project blueprints and operating docs
- `ops/agents/` - AI team role definitions
- `ops/memory/` - shared memory and canon rules
- `ops/workflows/` - repeatable production packet standards
- `server/` - server-side OpenAI, Seedance, and ElevenLabs adapters
- `video/` - Remotion editing/render compositions

## API Keys

Copy `.env.example` to `.env` and add keys there. Do not commit `.env`.

- `OPENAI_API_KEY` for the Opaija brain/style/prompt layer
- `FAL_KEY` for Seedance 2.0 through fal.ai
- `ELEVENLABS_API_KEY` for narrator and character voiceover

The repo stores API environment variable names, not secret values. Use the same `.env` values or production secrets across additional story-world clones.

## Video Editing

```powershell
npm run studio
npm run render:teaser
```

## Multi-World Cloning

Use `docs/MULTI_WORLD_CONTENT_ENGINE_PLAN.md` and `ops/world-pack-template/` to port this engine to another story world.

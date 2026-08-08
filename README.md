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

Set `BOOK_BUILDER_FORCE_MOCK=1` for offline/dev smoke tests that should skip OpenAI quota checks.

## Video Editing

```powershell
npm run studio
npm run render:teaser
```

## Multi-World Cloning

Use `docs/MULTI_WORLD_CONTENT_ENGINE_PLAN.md` and `ops/world-pack-template/` to port this engine to another story world.

## OPAIJA Book Builder Engine (for https://opaija.com/command)

This project now includes a working Book Builder dashboard that can be deployed behind `/command`.

### What is implemented

- `book-builder` API endpoints under `/api/book-builder/*`
  - health and provider status
- project setup and metadata (`/api/book-builder/projects`)
- character bible management
- style bible management
- chapter generation with panel/page breakdown
- job queue with progress and regeneration
- continuity log tracking
- asset inventory for generated prompt/panel files
- end-to-end test script: `scripts/book-builder-e2e.mjs`

### Local run

```powershell
npm install
copy .env.example .env
npm run dev
```

- Open: `http://localhost:5173/`
- API health: `http://localhost:8787/api/book-builder/health`

### Production build and Docker

```powershell
npm run build
docker build -t opaija-book-builder .
docker run --rm -p 8787:8787 --env-file .env -v ${PWD}/data/book-builder:/app/data/book-builder opaija-book-builder
```

Or run with compose:

```powershell
docker compose up -d --build
```

Expose service behind `https://opaija.com/command` with your VPS reverse proxy by forwarding the `/command` path to this container on port `8787`:

```nginx
location /command/ {
    proxy_pass http://127.0.0.1:8787;   # keep /command in URI
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Real-IP $remote_addr;
}
```

If your proxy strips the `/command` prefix, this app still works because it serves the dashboard on `/command` and rewrites `/command/api/*` to `/api/*` internally.

Quick checks after deploy:

```powershell
curl https://opaija.com/command
curl https://opaija.com/command/api/book-builder/health
```

### End-to-end verification

```powershell
npm run dev
# in a second terminal:
npm run builder:e2e
```

Expected output: `E2E PASS` with a JSON summary containing `projectId`, `chapterId`, `pageCount`, `continuityCount`, and `assetsCount`.

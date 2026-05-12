# Voice and Editing Stack

## Decision

Use three layers:

1. Seedance 2.0 for generated video shots.
2. ElevenLabs for controlled narrator and future character voices.
3. Remotion for the AI editing layer: image moves, video assembly, captions, audio timing, thumbnails, and final exports.

## Why Not Only Seedance Audio

Some Seedance routes can generate audio with video, and the adapter supports `generateAudio`. That is useful for quick atmospheric output, but it is not enough for a branded series voice system. Opaija needs repeatable narration, future character voice IDs, script timing, and clean edit control.

## ElevenLabs Setup

Environment:

```powershell
VOICE_PROVIDER=elevenlabs
ELEVENLABS_API_KEY=your_key
ELEVENLABS_NARRATOR_VOICE_ID=your_voice_id
ELEVENLABS_MODEL_ID=eleven_multilingual_v2
```

Dry-run voice packet:

```powershell
Invoke-RestMethod -Method Post http://localhost:8787/api/voice/jobs `
  -ContentType 'application/json' `
  -Body '{"text":"Every island has a warrior. Every rhythm has a weapon.","fileName":"pilot-cold-open.mp3"}'
```

## Remotion Setup

Commands:

```powershell
npm run studio
npm run render:teaser
```

Remotion reads images from `public/assets/characters/` and voiceover from `public/voiceover/`.

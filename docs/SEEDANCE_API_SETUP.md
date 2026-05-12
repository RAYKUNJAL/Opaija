# Seedance 2.0 API Setup

## Current Path

The command center uses a server-side video provider adapter. This keeps API keys out of the browser and lets us switch providers without rewriting the app.

Current provider options:

- `mock`: dry-run mode for prompt and packet testing.
- `fal`: live Seedance 2.0 jobs through fal.ai.
- `byteplus`: reserved for a future approved BytePlus/ModelArk enterprise route.

## Recommended First Live Route

Use fal.ai for the first working Seedance 2.0 integration:

- Text to video: `bytedance/seedance-2.0/text-to-video`
- Fast text to video: `bytedance/seedance-2.0/fast/text-to-video`
- Image to video: `bytedance/seedance-2.0/image-to-video`
- Fast image to video: `bytedance/seedance-2.0/fast/image-to-video`
- Reference to video: `bytedance/seedance-2.0/reference-to-video`
- Fast reference to video: `bytedance/seedance-2.0/fast/reference-to-video`

## Environment

Copy `.env.example` to `.env`, then set:

```powershell
VIDEO_PROVIDER=fal
FAL_KEY=your_fal_key_here
PORT=8787
```

Keep `FAL_KEY` server-side only.

## Create a Dry-Run Job

With `VIDEO_PROVIDER=mock`:

```powershell
Invoke-RestMethod -Method Post http://localhost:8787/api/video/jobs `
  -ContentType 'application/json' `
  -Body '{"mode":"text-to-video","prompt":"A 2.5D Caribbean anime hero steps into the gayelle at sunset, drums rising, gold dust in the air.","duration":"5","resolution":"720p","aspectRatio":"9:16"}'
```

## Create a Live fal Job

With `VIDEO_PROVIDER=fal` and `FAL_KEY` set:

```powershell
Invoke-RestMethod -Method Post http://localhost:8787/api/video/jobs `
  -ContentType 'application/json' `
  -Body '{"mode":"image-to-video","imageUrl":"https://your-public-image-url.png","prompt":"Animate the character from the reference sheet into a subtle ready stance. Preserve the 2.5D Caribbean anime style, face design, clothing, colors, and proportions.","duration":"5","resolution":"720p","aspectRatio":"9:16","fast":true}'
```

The response includes `requestId` and `modelId`.

## Check Status

```powershell
Invoke-RestMethod "http://localhost:8787/api/video/jobs/YOUR_REQUEST_ID/status?modelId=bytedance/seedance-2.0/fast/image-to-video"
```

## Get Result

```powershell
Invoke-RestMethod "http://localhost:8787/api/video/jobs/YOUR_REQUEST_ID/result?modelId=bytedance/seedance-2.0/fast/image-to-video"
```

## BytePlus Note

BytePlus/ModelArk publishes video generation documentation for Seedance model services, but availability and access depend on account, region, and enterprise terms. The adapter is intentionally isolated so we can add the approved BytePlus endpoint later without changing the command center UI or production workflow.

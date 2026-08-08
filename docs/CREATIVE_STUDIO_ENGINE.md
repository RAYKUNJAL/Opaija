# OPAIJA Creative Studio Engine

## Product contract

Book Studio and Video Studio are two control surfaces over one production model:

`World -> Project -> Canon Snapshot -> Story -> Scene/Page -> Shot/Panel -> Asset Revision -> QC Decision -> Export`

The OPAIJA world pack owns character, location, prop, combat, dialogue and visual rules. The engine owns projects, jobs, assets, versions, providers, costs, approvals, retries and exports. A future project adds a world pack instead of copying the application.

## Current vertical slice

- Persistent Video Studio projects in `data/video-studio/projects.json`.
- Outcome-led production templates.
- Episode-to-storyboard planning using the existing OPAIJA story framework.
- Explicit scene contracts with cast, location, references, camera, duration and prompt.
- No-spend deterministic preflight with a 95/100 commercial threshold.
- Hard budget check before the provider route can be used.
- Immutable revision lineage for retakes, variations and edits.
- OpenAI vision QC for one to six representative frames.
- Failed vision checks quarantine the selected revision and keep it out of the approved state.
- Existing Replicate LTX and Remotion paths remain provider/export adapters.
- Registry-driven Replicate video catalog with Seedance 2.0 as the default and LTX 2.3 Pro retained as the fallback.
- Project and scene records persist model ID, duration, resolution, aspect ratio and native-audio selection.
- Existing Video Studio JSON records migrate to Seedance 2.0 with a 720p, 9:16, native-audio default when no valid model configuration is present.

## Shared quality policy

Every paid media request must pass:

1. Canon snapshot exists and is locked.
2. Every named character has an explicit reference binding.
3. Character IDs are unique and prop ownership is explicit.
4. Scene, camera, location, duration and output constraints are valid.
5. Estimated spend remains inside the project hard limit.
6. The user explicitly approves the quote.

Every generated image or video keyframe remains a draft until vision QC confirms:

- correct character count and identities;
- distinct faces, outfits, silhouettes, gear and powers;
- plausible anatomy, hands, grips and eye-lines;
- no floating, detached, extra or incorrectly owned props;
- no face morphing, flicker, repeated frames or unexplained continuity changes;
- no random text, logos, blank banners, split panels or other AI artifacts.

The minimum automatic pass is 95/100 with zero blockers. A rejected revision is never promoted over an accepted revision.

## Provider boundary

### Video model registry

`server/videoStudio.ts` is the authority for model capabilities, validation, quoting and model-specific Replicate input construction. The client receives a serializable catalog from `GET /api/video-studio`; it does not maintain a second pricing table.

The default entry is `bytedance/seedance-2.0`:

- Whole-number durations from 1 through 15 seconds.
- Resolutions `480p`, `720p`, `1080p` and `4k`.
- Aspect ratios `16:9`, `4:3`, `1:1`, `3:4`, `9:16`, `21:9`, `9:21` and `adaptive`.
- Native synchronized audio can be enabled or disabled.
- Non-video-input prices per output second are `$0.08`, `$0.18`, `$0.45` and `$1.00` respectively.
- The approved start frame is submitted through the Replicate `image` field alongside `prompt`, `duration`, `resolution`, `aspect_ratio` and `generate_audio`.

`lightricks/ltx-2.3-pro` remains available as a fallback with its existing 6/8/10 second, 1080p, silent-video contract. Switching models applies that model's safe defaults and invalidates the previous preflight.

The visible inspector computes an indicative quote from the server-provided catalog. The server repeats validation and creates the authoritative no-spend quote during preflight. The preflight snapshots model ID, resolution, aspect ratio and audio selection so a later settings change cannot reuse a stale approval.

No provider request is part of the E2E script. It stops after checking the blocked preflight, quote and revision lineage.

The next extraction should expose one adapter contract for OpenAI, Replicate and future video providers:

```ts
interface GenerationProvider<Request, Result> {
  capabilities(): ProviderCapabilities;
  quote(request: Request): Promise<CostQuote>;
  submit(request: Request, context: SubmissionContext): Promise<ProviderRun>;
  status(run: ProviderRun): Promise<ProviderStatus>;
  cancel(run: ProviderRun): Promise<void>;
  fetch(run: ProviderRun): Promise<Result>;
  normalizeUsage(run: ProviderRun): Promise<UsageRecord>;
}
```

The agent may plan, repair a prompt and judge media. It may not choose an unapproved vendor, raise a retry or budget limit, charge an account, or mark an asset commercially approved.

## Commercial infrastructure phase

The JSON store is appropriate for the verified local vertical slice, not multi-user commercial operation. The commercial migration is:

1. Extract Zod contracts and provider adapters into workspace packages.
2. Move projects, immutable asset versions, approvals and the cost ledger to PostgreSQL.
3. Move binary assets to S3-compatible object storage with SHA-256 provenance.
4. Run long-lived generation as Temporal TypeScript workflows with child workflows per scene or shot.
5. Reserve, reconcile or release costs transactionally around every provider submission.
6. Add crash recovery, webhook idempotency, cancellation and concurrency controls.
7. Export only immutable approved asset versions with a signed manifest.

OpenAI stays a bounded planning and vision activity. Temporal, not an LLM loop, owns retries, resume, approval signals and budgets.

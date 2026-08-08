# VibeFrame server integration

This adapter exposes a deliberately narrow HTTP surface over the pinned VibeFrame CLI. It is designed for Windows and never invokes a shell.

## Required package and router export

The server requires the exact package already pinned by this project:

```text
@vibeframe/cli@0.113.24
```

The router is exported as both a named and default export:

```ts
import { vibeframeRouter } from "./vibeframeRouter.js";

app.use("/api/vibeframe", vibeframeRouter);
```

The mount is intentionally not added by this change because the integration owns only new files.

## Security boundary

- Every CLI invocation uses `spawn(process.execPath, [resolvedCliEntry, ...args])` with `shell: false`, `windowsHide: true`, fixed command builders, and a hard argument allowlist. No user-provided command, executable, flag, or shell string is accepted.
- `--json` is appended to every CLI invocation. A successful process that does not return parseable JSON is treated as failed.
- Mutating HTTP endpoints require `Content-Type: application/json`. Unknown JSON properties are rejected instead of ignored.
- Project IDs are slug-like values only. Projects resolve below `data/vibeframe/<projectId>`, and every accepted source/output path must be relative and remain inside that project directory.
- Child processes receive an environment allowlist, not the full server environment. Known provider values are redacted from results, errors, and audit records.
- Output capture is capped at 4 MiB per stream. Every operation has a bounded timeout, and active process trees can be cancelled. Windows cancellation uses `taskkill.exe` with a fixed argument array; it does not use `cmd.exe`.
- Job state is append-only JSON Lines at `data/vibeframe/.audit/jobs.jsonl`. API reads collapse this audit history to each job's latest snapshot.

Do not place `data/vibeframe` under a publicly served static directory. Apply the application's normal authentication and authorization middleware before mounting this router.

## API

Assuming the router is mounted at `/api/vibeframe`:

| Method | Path | Behavior |
|---|---|---|
| `GET` | `/health` | Pinned CLI, policy cap, active-job count, provider defaults, and credential-presence booleans. |
| `GET` | `/doctor?verbose=true` | Runs the allowlisted JSON doctor command without provider key tests. |
| `GET` | `/schema?command=build` | Lists public schemas or returns one allowlisted command schema. |
| `GET` | `/jobs?limit=50` | Returns persisted adapter jobs, newest first. Limit is capped at 200. |
| `GET` | `/jobs/:jobId` | Returns the latest persisted adapter-job snapshot. |
| `DELETE` | `/jobs/:jobId` | Cancels an active process tree; completed jobs are returned unchanged. |
| `GET` | `/projects/:projectId/status` | Runs VibeFrame project status. Optional `refresh=true`. |
| `POST` | `/projects/:projectId/init` | Initializes a scene project. Defaults to CLI dry-run; set `dryRun:false` to write locally. |
| `POST` | `/projects/:projectId/plan` | Produces a bounded plan/cost view and is always recorded as dry-run planning. |
| `POST` | `/projects/:projectId/dry-run` | Explicit preflight for `build`, `render`, or `remix`. |
| `POST` | `/projects/:projectId/build` | Dry-run by default. Paid execution requires the approval contract below. |
| `POST` | `/projects/:projectId/render` | Dry-run by default. Execution requires the approval contract below. |
| `POST` | `/projects/:projectId/inspect` | Cheap project/render inspection by default. AI render inspection requires `approved:true` and `maxCostUsd`. |
| `POST` | `/projects/:projectId/remix` | Highlights or auto-shorts. Dry-run by default; paid execution is fail-closed without a cost estimate. |

All fields are typed and allowlisted in `vibeframeAdapter.ts`. Unsupported fields return `ARGUMENT_NOT_ALLOWED`.

## Approval and cost contract

The server policy ceiling is `VIBEFRAME_MAX_COST_USD`, defaulting to USD 5.00 and hard-capped at USD 100.00. A request may set a lower `maxCostUsd` but cannot exceed the server ceiling.

Planning and preflight are the default:

```json
{
  "stage": "all",
  "videoProvider": "seedance",
  "maxCostUsd": 3
}
```

Omitting `dryRun` on build, render, or remix runs only preflight and returns `mode: "dry-run"`. To execute build or render, all three values must be explicit:

```json
{
  "dryRun": false,
  "approved": true,
  "maxCostUsd": 3
}
```

The adapter runs a fresh dry-run before submitting execution. Build also receives VibeFrame's native `--max-cost` flag. The pinned render schema has no native max-cost flag, so render is constrained by the server ceiling, explicit approval, and mandatory preflight; it normally performs local composition rather than provider generation. Remix execution is additionally blocked if its preflight omits a machine-readable cost estimate.

An accepted paid operation returns HTTP `202` with a submitted job and the preflight job ID. Poll `/jobs/:jobId` until the status is `completed`, `failed`, `cancelled`, or `timed_out`.

## Examples

Preview project initialization:

```json
{
  "brief": "A 20-second vertical product reveal with three beats",
  "ratio": "9:16",
  "duration": 20,
  "kind": "product"
}
```

Write the initialized project locally after reviewing the preview:

```json
{
  "brief": "A 20-second vertical product reveal with three beats",
  "ratio": "9:16",
  "duration": 20,
  "kind": "product",
  "dryRun": false
}
```

Inspect a render whose path is confined to the project:

```json
{
  "mode": "render",
  "video": "renders/final.mp4",
  "output": "reports/final.json"
}
```

Preview auto-shorts from project-owned media:

```json
{
  "operation": "remix",
  "mode": "auto-shorts",
  "source": "uploads/interview.mp4",
  "outputDir": "remixes/interview",
  "count": 3,
  "duration": 30
}
```

## Provider credentials

`videoProvider` defaults to `seedance` for plan and build. `REPLICATE_API_TOKEN`, when already configured on the server, is forwarded only to the child process and makes `replicate` the default music provider. Neither the token nor any other provider secret is returned by the API or written to the audit file.

Provider compatibility matters for this pinned CLI version: `@vibeframe/cli@0.113.24` implements Seedance video through fal.ai, so actual Seedance generation requires `FAL_API_KEY`. For compatibility with the existing application, the adapter also accepts existing `FAL_KEY` and maps it to `FAL_API_KEY` only in the child environment. A Replicate token is not relabeled as a fal.ai credential because those credentials are not interchangeable.

Other provider variables are forwarded only when already present and only from the adapter's explicit environment allowlist.

## Operational notes

- `queued` and `running` jobs are process-local for cancellation. Persisted history survives restarts, but a job from a prior server process cannot be cancelled by the new process.
- The audit log contains status snapshots, sanitized JSON results, timestamps, process IDs, approval state, dry-run state, and declared cost ceilings. It does not contain raw child arguments or environment values.
- Use project-relative paths such as `uploads/source.mp4`; absolute paths and traversal such as `../source.mp4` are rejected.
- This integration was added without mounting the router and without running tests, per the ownership and execution constraints for this change.

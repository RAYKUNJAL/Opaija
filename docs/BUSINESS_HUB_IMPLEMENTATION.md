# OPAIJA business hub: implemented foundation and deployment contract

Status: tested repository changes; NOT deployed to opaija.com. 5 September 2026.

## Intended business
Social content leads back to OPAIJA's reader, drop list, shop and customer library. OPAIJA owns subscriber records, consent, release history and customer entitlements. Social platforms are acquisition and distribution channels; no reader should need a social account to buy or read a book.

Paperclip manages assignments, dependencies, budgets and operating status. Goose performs bounded creative and production tasks using scoped OPAIJA tools. The backend owns canonical assets, job state, product records and customer data. Agent chat is not a database. One workflow must not be recreated as several disconnected buttons.

## What this branch actually implements

| Capability | Status |
|---|---|
| Source registry with page/panel addresses, canon version and hash-bound approval | Implemented |
| Durable SQLite queue, atomic job claiming, expiring leases and bounded attempts | Implemented |
| Numbered 1080×1920 motion-comic MP4 from 1–6 approved panels | Implemented; real FFmpeg render tested |
| Exact plain-text captions outside the generative model | Implemented, maximum 120 characters per shot |
| Worker that runs continuously when enabled | Implemented; not enabled on VPS |
| Protected operator console at /studio | Implemented; build verified; browser visual QA still needed |
| Scoped MCP tools for Goose | Implemented; MCP client/server integration tested |
| Goose recipe and Paperclip process-adapter configuration | Prepared from official docs; not run inside installed Goose/Paperclip |
| Owned book/merchandise email drop-list form | Implemented |
| Consent, duplicate handling, unsubscribe and durable email outbox | Implemented; no email delivery worker yet |
| AI-generated fight animation and voices | Existing providers require reconciliation and integration |
| New illustrated books and coloring-book generation | Not implemented by this branch |
| POD catalog, mockups, manufacturer orders and tracking | Existing draft helper only; live adapters still required |
| Checkout, paid membership and customer digital-library entitlements | Still required |
| Social publishing and recurring email campaigns | Still required |

The motion-comic renderer moves the camera over existing artwork. It does not animate character limbs or generate an anime fight. That output is useful as a repeatable low-cost derivative, while selected hero sequences can later use a measured image-to-video provider.

## Running the implemented slice

Requirements: Node >=22.13 (Node 24 tested), FFmpeg/FFprobe with libx264 and drawtext, DejaVu Sans. SQLite state must be on a local persistent disk, not a network filesystem. Keep DB, WAL, assets and renders in protected backups; use SQLite's backup mechanism or stop writers for a coherent backup.

Set environment values through the server secret configuration, not source files:

- PRODUCTION_ADMIN_TOKEN: unique random secret, at least 32 characters.
- PRODUCTION_AGENT_TOKEN: a DIFFERENT unique random secret, at least 32 characters. Never give agents the admin token.
- PRODUCTION_WORKER_ENABLED=true: turns on the queue worker.
- PRODUCTION_DATA_DIR: absolute writable state directory, default data/production.
- PRODUCTION_ASSET_DIR: absolute read-only artwork directory, default public/assets.
- OPAIJA_API_URL: backend URL for the Goose tool bridge, normally http://127.0.0.1:8787 on the same VPS.
- Optional FFMPEG_PATH, FFPROBE_PATH, PRODUCTION_FONT for installed tools.

Run npm ci, npm run build, npm run test:production, then npm start. Do this in a reconciled staging checkout first. Open /studio, enter the operator token, register an actual source file relative to the artwork directory, inspect it against canon, record source approval, select sources in order, and queue a short. The worker creates a video and manifest in the protected render directory. Review the output before recording cut approval. Approval does not distribute or sell anything.

The API hashes source bytes itself. The worker copies and verifies those bytes before rendering. Output approval checks the current video hash. Repeated job submissions with the same specification reuse a job ID. At most 100 pending/running jobs are accepted. Retry is manual for ordinary errors and capped at three attempts; expired worker leases can be reclaimed. These jobs are local renders and do not incur an AI provider charge.

## Goose and Paperclip

The MCP bridge is dist-server/production/mcp.js. It exposes only list_approved_sources, list_production_jobs and queue_motion_short. Agent credentials cannot approve sources, approve cuts, retrieve subscriber records or publish. Configure Goose with ops/goose/content-producer.yaml and supply its model/provider credentials through Goose's own secret configuration. Pin and test the installed Goose version before enabling recurring runs.

The Paperclip process-adapter payload is ops/paperclip/content-producer.json. Its command invokes the Goose recipe on the VPS. Apply it to a dedicated content producer in the existing Paperclip installation, with a run timeout and model budget. No Paperclip company, agent or heartbeat schedule has been created by this work. Process completion reports agent execution; it must never be interpreted as render approval or a published release. Paperclip issue checkout/completion and cost-reporting hooks still need integration with the actual installed version.

Sources: [Goose task execution](https://goose-docs.ai/docs/guides/running-tasks/), [Goose recipe schema](https://goose-docs.ai/docs/guides/recipes/recipe-reference/), [Paperclip process adapter](https://github.com/paperclipai/paperclip/blob/master/docs/adapters/process.md), [Node SQLite](https://nodejs.org/api/sqlite.html).

## Consolidation map

| Existing pieces | Shared destination |
|---|---|
| Character cards, style brain, bible drafts, asset upload | Versioned canon and asset registry; drafts never become locked through generation |
| Book builder, print packager, reader packager | One publication record with story, pages and separate print/digital adapters |
| Seedance, voice, FX, Remotion controls | One content job with provider adapters and persisted dependencies |
| Merch helper, catalog/mockup controls | One product record with approved artwork, variants, landed cost and manufacturer IDs |
| Founder form, preview gate, giveaway form, reader pass | One subscriber/customer identity, separate consent and preferences |
| Agent cards and static "online" indicators | Paperclip-backed actual run, cost and failure states |
| Growth campaign text and social publishing | Release-linked campaign, UTM attribution and owned-site conversions |

Do not delete old routes until production callers and data are inventoried. The live bundle exposes newer book-builder, login and blog routes absent from this source checkout. Preserve the production system while porting the new pieces into the authoritative codebase.

## Full workflow still to connect

A release begins with a locked story and character/weapon/location references. Goose proposes a typed page manifest. A book worker generates one addressable panel per task, validates and letters it, then assembles the numbered reader and print editions. A coloring-book adapter needs deliberate printable line art, not an automatic threshold filter assumed to be finished artwork. Only approved art feeds video and products.

A product needs artwork hash, manufacturer/variant IDs, printable area, resolution, mockup approval, stock/availability, landed cost, currency and margin. Catalog lookup and draft creation precede purchase-order submission. Confirm the chosen manufacturer's production API and webhook signature rules. Stripe or another selected processor must persist verified payment events and deduplicate delivery before granting a digital entitlement or sending a physical order. A repeated webhook must never buy the same shirt twice.

Recurring drop-list membership is free email consent. A paid recurring subscription is a separate product requiring price, billing interval, deliverables, cancellation and entitlement rules. The current signup does not charge anyone. Pending welcome messages are stored but not sent; connect the email worker with unsubscribe and suppression checks before launch. Legacy fan-leads.json has not been migrated or merged, and public re-enrollment cannot reactivate an unsubscribed record.

## Release gates and current blockers

1. Restore VPS access and identify its authoritative source revision. Remote Desktop reports no online device; direct SSH is unreachable from this runtime.
2. Back up code, database and assets; inventory Goose, Paperclip, model keys, manufacturer accounts and checkout integration without printing secrets or subscriber data.
3. Reconcile this branch into staging. The older checkout has unprotected legacy administrative routes; audit the actual production authentication before deployment. The NEW production endpoints are protected, but this patch does not secure all legacy endpoints.
4. Migrate subscribers with consent preserved and measurable row counts. Validate email delivery, suppression and preference management. Public signup rate limiting assumes the configured loopback reverse proxy; verify VPS topology.
5. Connect the remaining book, coloring-book, provider, product and payment adapters to one release record. Test real costs and accepted output quality with bounded runs.
6. Browser-check mobile signup and studio workflows. Deploy a versioned build with rollback. Only then enable timed agent assignments and release distribution.

No provider purchases, social posts, email sends, manufacturer orders or production deployment were performed.

## Shared memory and ten daily posts per platform

Added after the broader agentic-system requirement: persistent memory observations with author/evidence, deduplicated agent handoffs, seven MCP tools, and an idempotent social calendar. Memory topics are observation, correction, experiment and result. No memory endpoint changes canon. Handoff messages persist but do not themselves start a Goose/Paperclip agent; the receiving agent's Paperclip task loop still needs wiring, acknowledgements and per-agent identities.

The scheduler maintains ten slots per selected platform per day for seven days. Initial timing is 08:00 through 21:30 Trinidad & Tobago time, 90 minutes apart. This is an operating default, not an empirically optimized posting schedule. Set SOCIAL_PLATFORMS to connected target IDs (instagram, facebook, youtube, tiktok, x, pinterest). No accounts are assumed connected. The included systemd planning timer runs every minute; it only maintains the calendar and reports due items. It does NOT post. A future platform publisher must claim due deliveries transactionally, persist the provider request ID, verify the remote result, then mark published. A timeout after submission requires reconciliation rather than a blind duplicate upload.

Scheduling currently accepts only an approved rendered job, a caption and a destination on https://opaija.com. It blocks duplicate use of a cut on the same platform. Unconnected deliveries remain blocked_connection. Ten slots across four platforms means forty placements/day; the system must report empty slots when approved content is insufficient rather than generating fake completion counts or repeating rejected pages.

TikTok needs a different publishing path: its current Direct Post guidelines exclude private/internal utilities used only to upload to accounts owned by a team. Public API clients also need audit and specified user-facing controls. Keep preparation and calendar ownership inside OPAIJA, then use a supported integration or export handoff. Do not evade this with browser login automation. YouTube also restricts uploads from certain unverified API projects to private visibility until audit.

Sources: [TikTok content-sharing guidelines](https://developers.tiktok.com/docs/en/content-sharing-guidelines), [YouTube upload requirements](https://developers.google.com/youtube/v3/docs/videos/insert).

The growth objective is owned-reader conversion, retained subscribers and profitable releases. Learn from accepted-output cost, reader completion, signup conversion, purchase conversion, repeat purchases, unsubscribes and delivery failures. A million-dollar target is a business objective, not a validated forecast or a guarantee produced by increasing post volume.

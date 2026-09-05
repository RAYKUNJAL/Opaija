> Historical first checkpoint. See [BUSINESS_HUB_IMPLEMENTATION.md](BUSINESS_HUB_IMPLEMENTATION.md) for the newer queue, renderer, subscriber and Goose bridge implementation.

# OPAIJA production hub — implementation checkpoint

Inspected 5 September 2026. Repository: RAYKUNJAL/Opaija; branch fix/production-foundation.

## Evidence and deployment constraint
The live JavaScript bundle exposes book-builder, authentication and blog scheduling routes absent from this checkout. The repository is not a verified copy of production. Do not replace the VPS with this checkout. Remote Desktop reports no connected device; direct SSH to the documented VPS is unreachable from this workspace. No production changes or provider charges were made.

## Implemented
- Single-process serialized, atomic JSON writes for signups and referral counters. Corrupt data now fails instead of being silently replaced with an empty collection. A transactional database remains necessary before multiple API workers.
- Landing hero prioritizes the available free preview and credits Ray Kunjal; preview copy stops implying that character spreads are a completed comic.
- Pure panel-to-short planner: stable idempotency key, ordered unique panels, source hashes and canon version checks, exact captions, 1080×1920 output contract, explicit review gates. This is a planning component, not a running generation worker.
- Tests cover 100 simultaneous writes, preservation of corrupt storage, stale canon, duplicate sources and deterministic plans.

## Target manufacturing system
Use one approved asset registry for book pages, covers, video and merchandise. Each record needs character/prop IDs, source hash, canon version, script, licensing/provenance and a review decision bound to that hash. Generated derivatives never rewrite canon.

A coordinator should enqueue bounded jobs for storyboard planning, motion generation, voice, assembly, QC and packaging. Use PostgreSQL transactions and job leases; persist provider request IDs before polling. Submission timeouts enter an uncertain state for reconciliation, never a blind paid retry. Set per-job and daily budgets, attempt limits, exponential retry delays and a dead-letter queue. Restart recovery must not duplicate provider charges or published posts.

Prefer camera movement/parallax for ordinary panels. Spend generative video budget on selected action beats. Use the existing video adapter only after verifying its current model endpoint, pricing, credentials and image-reference support. Benchmark candidates on the same approved Kai/Malik panels: identity, weapon continuity, motion, latency and cost per ACCEPTED second. No model can be called smartest without this evidence.

Letter captions outside the image/video model. Assemble sound and exact captions with Remotion/FFmpeg; export vertical shorts and thumbnails from the same approved source. Track source → shot → cut → export → post. Technical QC and creative approval are separate. Automated jobs may reach needs-review; distribution requires an approved final cut and configured channel authorization.

## Conversion hub
Public navigation: Read, Characters, Roots, Shop. Primary action: available free preview. Secondary action: get Book Zero updates. Keep production tools behind authenticated admin routes. Use one short email form with explicit consent; move giveaway preferences and shirt sizes after signup. Do not automatically opt preview readers into a contest.

Measure preview_open, reader_progress, signup_start, signup_success, product_view, checkout_start and purchase with campaign attribution. Count signup success only after durable persistence; count purchases from verified payment events. Report completion and paid conversion by traffic source; views alone do not validate demand.

Shop release proposal: digital extras, a genuinely numbered 100-copy Book Zero set and open-edition Kai/Malik shirts. Pricing awaits landed costs and physical samples. Separate preorder and available inventory. No automatic storefront launch or fabricated scarcity.

## Reconciliation and release sequence
1. Connect the production device; capture commit/build identifier and a protected backup of code, database and asset registry. Do not dump secrets or subscriber records into reports.
2. Diff production against this branch; port targeted changes into the authoritative source.
3. Audit admin authentication, authorization, provider spend limits, signup abuse protection and storage. The old checkout exposes administrative routes without middleware; this does not prove the live server shares that behavior.
4. Migrate data with row counts/checksums and rollback; test public signup plus authenticated production workflows in staging.
5. Process one approved panel through a real paid provider with an explicit budget, inspect motion and weapons, then assemble one short.
6. Run restart, duplicate-delivery and provider-timeout tests before enabling scheduled batches. Deploy only the reconciled build with a rollback path.

## Canon and cultural copy
The bible defines OPAIJA as “The Staff of Battle” in the story. The author's belief that it derives from Swahili is recorded as an unverified etymology, not published fact. Do not substitute a guessed Yoruba derivation. A Roots series should distinguish sourced Kalinda history from fictional ancestral powers, and credit practitioners/sources.

## Remaining work
Production reconciliation, authenticated operator UI, transactional queue, live provider benchmarking, automated assembly integration, distribution adapters, analytics implementation and deployment remain unfinished. The current changes are a tested foundation patch, not a completed automated studio.

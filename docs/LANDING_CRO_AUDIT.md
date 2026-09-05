# OPAIJA landing-page CRO audit and revision

5 September 2026. Live site inspected in the cloud browser. Candidate code is prepared, not deployed. No conversion analytics were available, so impact rankings below are hypotheses, not measured uplift.

## Conversion diagnosis

The page asks visitors to follow a story, unlock a character flipbook, enter a giveaway, promote external social accounts and buy a vault. These compete with the intended primary goal: an owned relationship with a reader who returns for books and merchandise.

The most concrete defect is in the free reader: clicking Next changed the displayed page from 1 to 2, but repeated the same story paragraph and all four panel links. The screenshot asset identity was not conclusively compared, so this finding is about text and links, not a verified duplicate image file. Repair the actual reader manifest when its live code is accessible. Do not invent replacement story pages.

## Live checks performed

| Check | Observed result |
|---|---|
| Root page rendering | Renders; desktop first viewport inspected visually |
| Main Read the Founder Preview link | Opens /read-free successfully |
| Reader loading | Resolves to four-page Founder Preview |
| Next page | Advances to page 2; repeats paragraph and four panel links |
| Reader offer naming | The Tide Begins - USD0; reconcile with author-approved Book Zero naming |
| Reader email | Described as optional; email is also included in the checkout URL construction. Remove contact data from URLs in the live implementation |
| Upgrade navigation | Opens checkout; product resolves to OPAIJA Founder Digital Vault, USD7 |
| Payment | No PayPal transaction initiated; fulfillment not tested |
| Flipbook gate | Opens a name/email modal; no separate consent checkbox visible |
| Main giveaway form | Six profile controls and four social-action checkboxes before signup |
| Public proof | Leaderboard displays three empty founder spots in this session |
| Mobile viewport | Not visually tested: selected browser API has no viewport control; do not infer mobile results from the desktop screenshot |
| Candidate browser preview | Local preview URL blocked by cloud browser network boundary; candidate visual QA remains outstanding |

## Priorities

| Issue | Expected impact | Fix | Priority |
|---|---|---|---|
| Repeated reader content | Weakens trust immediately after primary CTA | Validate page map and script; hold any duplicate pages out of the public preview | P0 |
| Giveaway dominates subscriber flow | High friction for readers seeking release news | One email field, book/merch preferences and clear consent; keep contest as a separate optional flow | P0 |
| Ambiguous free/paid/full-book offers | Visitors cannot tell what is ready | Distinguish free character art, US$7 digital extras, and forthcoming Book Zero | P0 |
| Large hero wraps into six lines in observed viewport | Pushes action and offer explanation lower | Shorter, product-specific headline and tighter hero spacing | P1 |
| Multiple social tasks before owned signup | Sends attention away from the hub | Make the next step preview → drop list; social links become optional footer destinations | P1 |
| Unsupported “first/finally” positioning | Adds an avoidable credibility claim | State Caribbean origin and genre without a historical first claim | P1 |
| Empty leaderboard | Adds no earned proof | Show character art and author credit instead | P2 |
| Production/QC jargon on public page | Distracts from what fans receive | Use reader-facing availability and contents language | P2 |
| No observed explicit consent in gate | Unclear permission for recurring release email | Visible consent and unsubscribe expectation; no automatic contest enrollment | P1 |
| Email appears in checkout URL construction | Contact data may enter URL logs/history | Persist through a protected request/session; use opaque identifiers | P1 |

## Implemented candidate

Root route now uses CroLanding.tsx and scoped CroLanding.css. Existing checkout, reader and member routes must be preserved from the live source during reconciliation; this repository does not contain all of them. Do not deploy the stale checkout wholesale.

Page order:
1. Short hero: product, origin, author, free-preview CTA.
2. Two distinct character sheets, with clear availability wording.
3. Owned drop-list form: email, selected interests, consent.
4. US$7 one-time vault offer linked to the existing checkout route.
5. FAQ: complete book availability, free signup, email preferences, no social-account requirement.
6. Footer with member access and repeated signup CTA.

Replacement headline: “A Caribbean battle saga. It starts in Trinidad & Tobago.”

Subhead: “Meet Kai and the world of OPAIJA, where rhythm carries memory and a fighter must learn to listen. Explore the character art, then follow the journey to Book Zero.”

Primary CTA: “Explore the free preview.”

Secondary CTA: “Get book & merchandise updates.”

Proof: visible character artwork and “Written and created by Ray Kunjal.” No invented testimonials, visitor counts or sold-out badges.

The candidate uses a static existing hero image rather than autoplay video, retains full character-sheet images, adds mobile-specific layout rules, uses 52px primary actions, native email input and visible focus states. These are implementation facts; browser mobile QA is still pending. The form submits to /api/subscriptions from the foundation branch. Its pending email outbox must be connected before production signup promises include email delivery.

## Test plan

Instrument on the owned backend using opaque first-party session IDs and campaign attribution, never email in event URLs. Candidate data-cro-event attributes label CTA locations but do not themselves collect analytics.

- Primary outcome: unique new consented subscribers / unique eligible landing visitors.
- Diagnostics: preview opens / visitors; form starts / preview visitors; successful durable signups / form starts.
- Revenue: verified paid orders / checkout starts; contribution margin per acquired visitor.
- Guardrails: unsubscribe rate, failed signups, duplicate signups, page errors, payment failure, mobile overflow and accessibility.

First experiment: current messaging vs revised clear-offer messaging, with the same audience and offer. Fix repeated preview content before experimentation. Choose baseline rate, minimum meaningful effect and sample size before launching; do not claim a winner from a few clicks. Keep device/source cohorts separate and run across a full weekly cycle when traffic permits. Next experiment can compare preview-first vs signup-first order. Do not change headline, price and traffic source simultaneously and attribute the difference to one change.

## Deployment

Still blocked: no connected desktop device; SSH alias/key absent in this runtime; direct SSH unreachable. Apply the candidate to the verified /opt/opaija-book-builder Docker source only after access is restored. Keep existing Traefik routing, checkout, member access and data mounts. Run desktop/mobile browser checks and staging form tests, then use the documented tagged-image rollback workflow. No live page, reader data or customer record was changed during this audit.

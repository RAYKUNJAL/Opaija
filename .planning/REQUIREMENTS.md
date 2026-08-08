# Requirements: OPAIJA Million-Dollar Brand System

**Defined:** 2026-08-07
**Core Value:** A fan can discover, read, pay through PayPal, and immediately receive purchased access.

## v1 Requirements

### Funnel

- [ ] **FUN-01**: A visitor can submit name, valid email, and consent to open Issue #0.
- [ ] **FUN-02**: A reader can view every available Issue #0 asset on mobile and desktop.
- [ ] **FUN-03**: The thank-you page offers a $7 digital pass and optional $2.99 audio bump without unsupported products.
- [ ] **FUN-04**: Required funnel events are recorded with source and campaign context.

### Payments and Access

- [ ] **PAY-01**: Checkout creates a PayPal order using the server-calculated catalog price.
- [ ] **PAY-02**: Capture is verified server-side before an entitlement is issued.
- [ ] **PAY-03**: A buyer receives an access token and receipt after successful capture.
- [ ] **PAY-04**: Duplicate capture requests are idempotent.
- [ ] **PAY-05**: Unconfigured PayPal products are hidden or return an explicit unavailable state.

### Member Experience

- [ ] **MEM-01**: An entitled member can open purchased reader content.
- [ ] **MEM-02**: Archive, character, vote, collectible, referral, and profile controls persist real user actions.
- [ ] **MEM-03**: Unavailable drops, merch, audio, or video are not presented as purchasable/live.

### Growth and Publishing

- [ ] **GRW-01**: Lead capture persists consent, source, and referral attribution.
- [ ] **GRW-02**: Consent-based delivery and nurture emails are queued and sent through the configured provider.
- [ ] **GRW-03**: Two editorial slots per day are maintained with useful SEO, GEO, and conversion content.
- [ ] **GRW-04**: Only published posts are publicly readable and included in the sitemap.
- [ ] **GRW-05**: Admins can observe publishing cadence, failures, and next scheduled work.

### Launch Quality

- [ ] **OPS-01**: Build and automated API checks pass.
- [ ] **OPS-02**: Public funnel and member journeys pass desktop and mobile browser checks.
- [ ] **OPS-03**: Payment, auth, content visibility, and personal-data boundaries pass a security review.
- [ ] **OPS-04**: Production configuration reports missing dependencies without simulating success.

## v2 Requirements

### Fulfillment

- **FUL-01**: Physical collector products route to a configured print provider.
- **FUL-02**: Approved merch products route to a configured print-on-demand provider.

### Channels

- **CHN-01**: Approved videos publish to authenticated social provider accounts.
- **CHN-02**: SMS messaging is enabled after a compliant provider and explicit consent flow are configured.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Stripe | PayPal is the required payment provider |
| Fabricated social proof | No verified source exists |
| Mock public fulfillment | Violates the functional-only requirement |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FUN-01 through FUN-04 | Phase 2 | Pending |
| PAY-01 through PAY-05 | Phase 1 | Pending |
| MEM-01 through MEM-03 | Phase 2 | Pending |
| GRW-01 through GRW-05 | Phase 3 | Pending |
| OPS-01 through OPS-04 | Phase 4 | Pending |

**Coverage:** 20 v1 requirements, 20 mapped, 0 unmapped.

---
*Last updated: 2026-08-07 after initial definition*

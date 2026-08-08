# OPAIJA Million-Dollar Brand System

## What This Is

OPAIJA is an owned-platform anime and comic brand funnel for Caribbean and global fans. It turns short-form discovery into a free digital issue, a PayPal purchase, member access, referrals, recurring content, and measurable customer relationships on opaija.com.

## Core Value

A fan must be able to discover OPAIJA, read real story content, pay through PayPal, and immediately receive the access they purchased.

## Requirements

### Validated

- Existing React and Express application with public, member, publishing, and Book Builder surfaces.
- Existing free-reader catalog API, lead capture, referrals, analytics events, blog storage, and PayPal API adapter.
- Existing OPAIJA character, video, flipbook, and reader assets.

### Active

- [ ] Complete the free issue to $7 starter pass funnel with optional $2.99 audio bump.
- [ ] Verify PayPal order creation, capture, entitlement issuance, and receipt delivery end to end.
- [ ] Remove or replace customer-facing placeholders and unsupported offers.
- [ ] Deliver a useful member home, reader, archive, character, vote, collectible, referral, and profile experience.
- [ ] Publish two useful SEO/GEO/CRO posts daily with durable scheduling and public pages.
- [ ] Track the required funnel and membership events without exposing customer data.
- [ ] Provide launch operations, security checks, and evidence-backed verification.

### Out of Scope

- Stripe or card collection outside PayPal - the user explicitly selected PayPal.
- Claims of physical inventory or one-click upsells without a configured fulfillment provider.
- Synthetic reviews, sales counts, or scarcity claims - unverified social proof damages trust.
- Automatic public social posting when provider credentials and approved media are absent.

## Context

The codebase is brownfield and includes a broad internal anime production command center. The commercial launch surface must remain distinct from mock-capable creative tooling. Existing assets are reused; missing products or content are removed from public promises until real files and providers exist.

## Constraints

- **Payments**: PayPal only, with server-side capture verification.
- **Functionality**: Customer-facing controls must work or be removed.
- **Ownership**: Leads, orders, entitlements, referrals, content, and analytics remain on the OPAIJA platform.
- **Operations**: Scheduled work must survive normal process operation and expose observable status.
- **Trust**: No fabricated proof, inventory, countdowns, or fulfillment claims.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Free Issue #0 leads into a $7 digital starter pass | Lowest-friction path in the supplied blueprint | Pending verification |
| Optional audio bump is $2.99 | Matches the approved offer ladder | Pending verification |
| Founder membership uses PayPal subscriptions only when configured | Prevents false checkout paths | Pending verification |
| Physical and merch offers stay hidden until fulfillment is live | User requires functionality over placeholders | Pending verification |
| Two daily editorial slots at 08:00 and 20:00 | Matches the growth requirement | Pending verification |

## Evolution

This document evolves after each verified phase and milestone audit.

---
*Last updated: 2026-08-07 after autonomous build initialization*

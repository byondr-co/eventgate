# Phase 2 candidate slate — shaping doc (revenue-first)

> **Status:** Shaping doc, NOT an implementation plan. No spec, no tasks, no
> code. Output of a prioritization brainstorm on 2026-06-11. Inputs:
> `docs/brief.md` §12 (Phase 2/3 roadmap) + the deferred backlog in
> `docs/handoff-2026-06-03-post-plan-l-state.md`.
>
> **This slate is provisional.** It is ordered by a *revenue-first* lens chosen
> before the pilot. The Click Cam pilot (2026-06-19 → 2026-07-17) will generate
> real feedback that re-ranks everything. Do not convert any tier to a
> `writing-plans` plan until the pilot has produced its findings. Treat this as
> "what we'd build if the pilot validates the product," ready to merge with
> "what the pilot taught us."

## The bet this slate encodes

The brief (§1, decision #6) deliberately deferred billing: *"manual invoicing
during customer development (~first 10–20 customers)."* Ordering revenue work
**first** is a conscious departure from that — it bets that **the Click Cam
pilot is the product-market-fit test**, and that a clean pilot means the next
constraint is "get paid," not "add more operational features."

**Contingency:** if the pilot stumbles (data-loss, door-flow failures, low
organizer confidence), Tier 3 (operational maturity) jumps ahead of Tier 1/2 —
you don't monetize a product that isn't trusted at the door yet. Revisit this
ordering with pilot data in hand before committing.

## Current state (verified in code 2026-06-11)

Phase 1 modules (brief §3) all shipped. Phase 2/3 confirmed **not started** —
no SSE/streaming, no export endpoints, no bulk guest actions, no event clone,
no named-staff identity, no analytics route, no payment integration. The
`organizations.plan` column exists (`DEFAULT 'trial'`) but is **inert** — no
entitlement checks read it.

---

## Tier 1 — Organizer billing (SaaS revenue)

*Simpler than ticketing, no attendee-facing money, recurring revenue from the
people you already sell to. Stand up the payment rails here; Tier 2 reuses
them. This is the reason billing-before-ticketing is the right sequence.*

| # | Item | Current state | Unlocks | Rough size / risk |
|---|------|---------------|---------|-------------------|
| 1 | **Entitlement / plan model + enforcement** | `organizations.plan` inert | Free(≤50)/Pro(≤200)/Business(≤1000) by the brief's per-event guest-count pricing; meter guest count per event; soft-paywall at event creation / registration cap | M · low-risk; pure backend + a few UI gates. The metering unit (per-event vs per-seat) is a pricing decision to confirm. |
| 2 | **Payment rails: Stripe + ABA PayWay** | none | Collect from organizers (subscription or per-event charge); webhooks, reconciliation patterns reused by Tier 2 | L · **ABA PayWay is the risk** — merchant account, KHR/USD settlement, sandbox access, Cambodia tax/invoicing. Spike before estimating. Stripe is well-trodden. |
| 3 | **Billing admin** | none | Invoices, receipts, plan management UI (brief's platform-admin "billing management") | M · depends on #1+#2. |

**Hard prerequisite pulled forward from the deferred backlog:** the email
sender is still `onboarding@resend.dev` (sandbox, only delivers to
vinei.dev@gmail.com). You cannot send invoices/receipts from a sandbox sender,
so **verifying `noreply@mail.byondr.co` is a Tier-1 blocker**, not a "someday"
cleanup.

---

## Tier 2 — Paid ticketing (attendee pays)

*Depends entirely on Tier 1's payment rails. A new product surface attendees
touch; higher complexity (money + refunds + reconciliation + fraud).*

| # | Item | Unlocks | Rough size / risk |
|---|------|---------|-------------------|
| 4 | **Ticket types + price + inventory/seat caps** | Organizers sell tickets; capacity enforcement | M |
| 5 | **Checkout at the public registration form** | Stripe Checkout + ABA PayWay inline in the existing reg flow | M · reuses Tier-1 rails |
| 6 | **Orders / refunds / payout reconciliation** | Real money lifecycle; Eventgate's cut | L · refunds + reconciliation are the hard part |
| 7 | **Tax + fraud handling** | Compliance + chargeback defense | L · Cambodia tax rules = research; fraud = rate-limit + review |

---

## Tier 3 — Operational Phase 2 (brief §12) that de-risks charging for real events

*Independent of revenue work; some of it is what makes a Pro/Business tier
worth paying for. If the pilot says "the door/ops aren't ready," this tier
leapfrogs Tier 1/2.*

| # | Item | Notes |
|---|------|-------|
| 8 | **Named-staff identity** (magic-link per staff, PIN stays as fallback) | Brief §12 + risk table; the security-maturity story for charging for "real" events. Largest Tier-3 item. |
| 9 | **CSV/PDF export + bulk guest actions + event cloning** | Pro-tier value; organizer retention + post-event handoff. Smallest, highest-ROI cluster here. |
| 10 | **SSE live dashboard + gate analytics** | Business-tier differentiators (replaces 5–10s polling; throughput/peak-window/gate-utilization). |
| 11 | **WhatsApp Business delivery** | Brief §12; needs template approval flow. Channel expansion beyond email/Telegram. |

---

## Tier 4 — Deferred hardening (pilot-safe, do anytime)

*Small, low-risk, no feature dependency. Good filler between bigger tiers or
when avoiding codebase churn near an event. From the 2026-06-03 deferred
backlog.*

- Narrow `ALLOWED_HOSTS` from `"*"` (Plan J debt) — security.
- Audit log of role changes / membership removals.
- Refresh-token revocation on logout.
- Org slug rename.
- Short-URL custom domains (per-customer vanity).
- *(Sender-domain switch is NOT here — promoted to a Tier-1 blocker above.)*

---

## Dependency chain (the load-bearing edges)

```
sender-domain verification ──▶ Tier 1 #3 (billing emails)
Tier 1 #1 entitlement ────────▶ Tier 1 #3 (what to invoice)
Tier 1 #2 payment rails ──┬───▶ Tier 1 #3 (charge organizer)
                          └───▶ Tier 2 #5,#6 (charge attendee)  ← the reuse that justifies sequencing
Tier 3 is independent of Tiers 1/2 and can interleave.
Tier 4 is independent of everything.
```

## Open questions for the pilot to answer (re-rank inputs)

1. Did organizers trust the door flow enough that "get paid" is genuinely the
   next constraint? (Gates the whole revenue-first premise.)
2. Per-event vs per-seat metering — which matches how pilot customers think
   about price?
3. Is ABA PayWay a hard requirement for the first paying customers, or does
   Stripe-only get you to first revenue faster? (Could split Tier 1 #2.)
4. Which Tier-3 item did the pilot make loudest (export? named staff? live
   dashboard?) — that one may outrank Tier 2.

## Next step (post-pilot)

After the pilot findings land (log them in
`docs/plans/improvement-and-findings-logs.md`), re-rank this slate, then invoke
`superpowers:writing-plans` on the **single** top item (likely Tier 1 #1
entitlement model, unless the pilot reorders). One plan at a time, per the
project's established rhythm.

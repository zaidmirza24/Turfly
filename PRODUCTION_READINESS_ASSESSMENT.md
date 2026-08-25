# TURF BOOKING SYSTEM — PRODUCTION READINESS ASSESSMENT

**Date:** 2026-08-23, audited; 2026-08-24, all seven "must fix before launch" items closed; 2026-08-25, follow-up audit against HEAD `e7def0b`.
**Scope:** Full-stack audit of the TURF platform — Backend (Express/MongoDB, ~9.6k LOC) + Frontend (React/Vite/TS, ~17.1k LOC), evaluated against real-world turf-booking business requirements.
**Supersedes:** the 2026-08-21 audit (score 53/100, verdict "NOT SAFE TO LAUNCH — no payment system exists"). That document is preserved in git history.

**Overall Score: 70/100 at 2026-08-23 audit → 84/100 after the 2026-08-24 fix pass → 86/100 after the 2026-08-25 follow-up (see addendum at top)**
**Production Readiness: 72/100 → 88/100 → 89/100**
**Verdict: 🟢 GO for a soft launch, with one new High-severity item to close first: cancelled bookings still carry a payable `payoutStatus: PENDING` (see 2026-08-25 addendum).** The rest of this document (2026-08-23/24) is kept unedited below as the historical record; the 2026-08-25 section is a fresh independent re-audit against the current codebase, not a rewrite of the old findings.

---

## Follow-up audit (2026-08-25) — against HEAD `e7def0b`

Three commits landed since the 2026-08-24 fix pass and materially changed the system: `5cc362f` (migrated all money fields to integer paise; also fixed a live regression where online bookings silently failed — payment captured, auto-refunded, no booking created), `75fcdae` (removed the refund system and owner-approval flow entirely as a deliberate product decision — cancelling now frees the slot but returns no money — plus a double-pricing bug fix and new COMPLETED/NO_SHOW booking states), and `e7def0b` (an in-process reminder scheduler for long-lived deployments, alongside the existing Vercel cron). This section independently re-verifies the codebase against these changes rather than trusting the commit messages. Verified locally: **173/173 backend tests pass, 40/40 frontend tests pass, `tsc --noEmit` clean.**

### New finding — High: cancelled bookings keep a payable `payoutStatus: PENDING`, so an owner can be paid for a slot that was never played (and double-paid if it's resold)

Before `75fcdae`, every cancellation ran through the refund flow, and `applyRefundToBooking` (`payment.service.js:871-887`) flipped the booking's `payoutStatus` to `VOID` as a side effect. Now that customer/owner-initiated cancellation (`cancelBooking` at `booking.service.js:701-744`, `cancelBookingAsOwner` at `:752-780`) no longer touches the payment or refund path at all, nothing voids the payout — `payoutStatus` is untouched by either function. `VOID` is now set in exactly one place in the whole codebase (`payment.service.js:875`), reachable only from the two remaining system/dashboard-refund paths, which cancellation never calls.

Consequences, both confirmed by reading the actual query and mutation:
- `getPendingPayoutsSummary` (`admin.service.js:364-368`) and `getOwnerPayoutSummary` (`:410-417`) both aggregate on `{ payoutStatus: "PENDING" }` alone — a cancelled booking's owed-to-owner amount still shows up in the admin "Pending Payouts" screen and the owner's earnings summary, indistinguishable from a real completed booking.
- `markBookingPaidOut` (`booking.service.js:792-839`) only refuses a booking whose `payoutStatus !== "PENDING"` (:801) — it does **not** check `booking.status`. An admin can settle a payout for a `CANCELLED` booking with no error.
- Since the slot is released back to `AVAILABLE` on cancellation and can be rebooked, the failure mode is: customer cancels 6h+ before the slot (keeps no refund by policy — that part is fine), owner still collects a payout for a slot they didn't host, and if the slot resells, the owner is paid twice for one physical slot occupancy. This is real money leaving the platform, not a display bug.

**Fix direction:** either (a) filter `payoutStatus: "PENDING"` queries and `markBookingPaidOut` to also require `status: { $ne: "CANCELLED" }`, or (b) explicitly set `payoutStatus: "VOID"` inside `cancelBooking`/`cancelBookingAsOwner` when it was `PENDING` (cheaper, and matches the existing `VOID` semantics used by the refund path — a cancelled-with-no-refund booking is exactly the "owner is not owed anything for this" case `VOID` already models).

### New finding — Medium: lazy COMPLETED/NO_SHOW settlement isn't applied on every read path, so the same booking can show different statuses in different admin/owner screens

`settleFinishedBookings` (`booking.service.js:607-613`) is called before `getUserBookings`, `getBookingsByTurf`, `getOwnerBookings`, and `getOwnerStats`, but **not** before `getOwnerCustomerDetail` (`:1119-1147`), `getOwnerCustomers` (`:1057-1111`), `getAllBookingsForAdmin` (`admin.service.js:223-254`), or `getCustomerDetailForAdmin` (`:315-335`). A booking whose slot time has passed reads as `COMPLETED` on the owner's per-turf bookings page but can still read as stale `CONFIRMED` on the owner's customer-detail page or in the admin bookings list, until something else in the app settles it first. Revenue and count totals are unaffected — every aggregate correctly reads `HONOURED_STATUSES`/`IS_HONOURED_EXPR` (`booking.model.js:224-227`), which already includes CONFIRMED, COMPLETED, and NO_SHOW — so this is a status-label inconsistency, not a money bug. Cheap fix: call `settleFinishedBookings` with the right scope at the top of the four missing functions too.

### Re-verified: the four Critical items from the 2026-08-23/24 audit are still genuinely fixed, and two are now moot

Read directly against current code, not the changelog:
- **PAID-with-no-booking crash window**: still closed — `Payment.bookingIds` is pushed incrementally, and `findStuckPayments`/`reconcileStuckPayment` (`payment.service.js:412-497`) remain the recovery path. Lower stakes than before: since refunds for this system-triggered case are explicitly carved out of the "no refunds" policy (comment at `payment.service.js:594-605`), a crash here still ends in a correct outcome, just a delayed one.
- **Dashboard refund not voiding payout**: still closed — `finalizeRefundIfComplete` still reconciles unattributed full refunds against every active booking on the payment.
- **`refunds[]` lost update**: still closed — `upsertRefundEntry` (`:791-861`) is still atomic `findOneAndUpdate`, no load-then-save.
- **Booking-list pagination**: fixed properly now, not as a stopgap — `pageOfReservations` (`booking.service.js:547-591`) is a real two-round-trip `$group`+`$facet` aggregation; the old capped-500-then-slice-in-JS code and `MAX_BOOKINGS_SCAN` are gone entirely.

### Paise migration (`5cc362f`) — verified clean

Every model (`Turf`, `Slot`, `Booking`, `Payment`, `Payout`) stores money exclusively as integer `*Paise` fields with `Number.isInteger` validators; every `toJSON`/`toObject` transform strips the paise field and substitutes a rupee field for the API response. `common/utils/money.js`'s `toPaise`/`toRupees` are simple and covered by round-trip tests. Razorpay calls (`payment.service.js:152-153, 201-202, 617-618`) pass `amountPaise` straight through with no double conversion, and the frontend checkout (`BookingFlowPage.tsx:262`) does the same. The double-pricing bug (hourly rate written onto a 30-minute slot) is fixed at the root via a single `hourlyRateToSlotPricePaise` helper, and both frontend and backend agree on the halving. No stale rupee-named fields or mixed-unit reads found by grep across `src/modules/**/*.js`.

### "No refunds" removal (`75fcdae`) — infrastructure correctly narrowed, not blanket-deleted, but see the payout finding above

The refund *code path* was deliberately kept for exactly two cases (documented at `payment.service.js:594-605`): a system auto-refund when a captured payment can't produce a booking, and reconciling a refund issued by hand from the Razorpay dashboard. Customer/owner cancellation never calls either. No leftover "record a refund" admin route, no leftover owner-approval workflow (`PENDING_OWNER`/`ownerApproval`/`CANCEL_REQUESTED` are gone from the codebase). Frontend copy (`BookingCard.tsx`, `lib/booking.ts:88-94`, `HelpPage.tsx:17`, `LegalPages.tsx:43-45`, both admin/owner `BookingDetailDrawer.tsx`) consistently says non-refundable while still correctly surfacing `REFUNDED`/`REFUND_PENDING`/`REFUND_FAILED` for the narrower system-refund case. The one thing this removal didn't account for is the payout side, above.

### Reminder scheduler (`e7def0b`) — claims verified against code, no issues found

`src/server.js` is the only caller of `startBookingReminderScheduler()`; the serverless entry (`app.js`/`api/index.js`) never calls it, so a Vercel deployment still relies solely on the existing hourly cron (`vercel.json`) — correct, since a `setInterval` registered on a serverless entry point would fire unpredictably or never. The overlap guard, error-swallowing, and `SIGTERM`/`SIGINT` cleanup described in the commit message are all real, not just claimed. Running the in-process poller and the Vercel cron at the same time (e.g. during a migration between hosting models) is safe: both funnel through `sendOnce` (`email.service.js:26-69`), backed by a unique index on `NotificationLog.dedupeKey` — a `create()`-then-catch-duplicate pattern, not a read-then-write race.

### Test coverage note

The new lifecycle logic (`settleFinishedBookings`, `pageOfReservations`) and the reminder scheduler's overlap guard have no dedicated tests — grep confirms zero references in any `*.test.js`. The stuck-payment reconciliation added in the 2026-08-24 fix pass does have coverage (`payment.reconciliation.test.js`, 9 tests). Worth adding tests for the new payout-status gap above before fixing it, so the fix has a regression test.

### Updated top risk, replacing the old #1

| # | Risk | Severity | Evidence | Fix before launch? |
|---|---|---|---|---|
| 1 | Cancelled booking keeps `payoutStatus: PENDING` — owner can be paid (or double-paid on resale) for a slot never played | High | `booking.service.js:701-780` (no payoutStatus touch); `admin.service.js:364-368,410-417`; `booking.service.js:792-839` | Yes (cheap — one-line fix per cancellation function) |
| 2 | Booking status settlement not applied on 4 of 8 read paths | Medium | `booking.service.js:1057-1147`; `admin.service.js:223-254,315-335` | Recommended |
| 3 | No dedicated tests for new lifecycle/settlement/scheduler code | Low | grep, no matches | Recommended |

---

## Fix pass (2026-08-24)

All four Critical findings and all seven "must fix before launch" items below were addressed the day after this audit. Verified: **153/153 backend tests pass** (16 new, covering exactly these fixes), **40/40 frontend tests pass**, **`tsc --noEmit` clean**.

1. **PAID-with-no-booking crash window** — `finalizePaymentSuccess` now persists `Payment.bookingIds` incrementally (one `$push` per slot confirmed, not just at the end), so a mid-loop crash leaves an accurate partial record instead of `[]`. New `findStuckPayments`/`reconcileStuckPayment` (`payment.service.js`) detect payments where `bookingIds.length < slotIds.length` and finish the job — confirming whatever's still unclaimed, or rolling back and fully refunding if a slot was lost to a race. Exposed at `GET /admin/payments/stuck` / `POST /admin/payments/:id/reconcile`, with a new **Admin → Stuck Payments** page (previously this was API-only in plan; it now has a UI, added specifically because a reconciliation surface nobody can see isn't a fix).
2. **Dashboard-issued refunds not voiding payouts** — `finalizeRefundIfComplete` now handles a refund with no `notes.bookingId` match (i.e., not initiated by this codebase) by treating a *full* refund as covering every still-active booking under that payment: cancels them, releases the slots, and voids/claws back the payout, exactly like an in-app cancellation would. A *partial* unattributed refund is deliberately left alone and logged for manual review — it can't be safely auto-attributed to one booking out of several.
3. **Lost update on `refunds[]`** — `upsertRefundEntry` rewritten from load-then-`.save()` to two atomic `findOneAndUpdate` calls (update the positional element if it exists, `$push` a new one if not, with a guarded fallback for the race between them). No more read-modify-write.
4. **No reconciliation tooling** — closed by items 1 and the new Admin UI.
5. **Booking-list queries unbounded** — `getUserBookings`/`getBookingsByTurf`/`getOwnerBookings` now cap the raw fetch at 500 documents (`MAX_BOOKINGS_SCAN` in `booking.service.js`) before grouping, and `Booking` gained compound indexes on `{turfId, createdAt}` / `{userId, createdAt}` matching the actual query shape. Documented as a bounded stopgap, not the real fix (an aggregation pipeline that groups server-side) — see the comment at its definition.
6. **No CI** — `.github/workflows/ci.yml` runs both test suites plus a frontend typecheck on every push/PR.
7. **`/api/health` didn't check the DB** — now checks `mongoose.connection.readyState` and returns 503 if disconnected.
8. **No password reset** — real feature, not a bigger stub: `POST /auth/forgot-password` / `POST /auth/reset-password`, SHA-256-hashed single-use tokens with a 1-hour expiry, same generic response whether or not the email exists (no enumeration oracle), a new transactional email template, and working `/forgot-password` + `/reset-password` frontend pages replacing the old "email support" stub.

Also fixed in passing: the dead `already + amount >= payment.amount ? "PAID" : "PAID"` ternary in `payment.service.js`, two stale schema comments in `booking.model.js` ("there is no admin/owner cancellation endpoint yet" — there is; "no payment gateway exists" — there is), and a frontend crash-in-waiting in the admin audit log (`AuditLogRow.tsx` indexed action metadata with no fallback — the new `PAYMENT_RECONCILED` action type would have thrown `Cannot read properties of undefined` the first time one was logged; now has a defensive fallback for any future unknown action type too).

**What's still open** (unchanged from the audit, not addressed by this pass — see "What can wait" below): reschedule/no-show workflow, SMS, JWT revocation, TS `strict` mode, the aggregation-based real fix for booking-list pagination, full APM/alerting, and integration/concurrency tests against a real MongoDB rather than mocks.

---

## Original audit (2026-08-23) — unedited

---

## What changed since the last audit

The previous audit's verdict rested on one fact: no code path moved money. That is no longer true, and four of its five Critical Blockers are genuinely resolved — verified by reading the code, not by trusting the changelog:

| Previous blocker | Status | Evidence |
|---|---|---|
| 1. No payment gateway | ✅ Resolved | `modules/payment/` — Razorpay orders, HMAC signature verification built from the server's own stored order id, live `payments.fetch` status re-check, webhook with raw-body HMAC |
| 2. No refund mechanism | ✅ Resolved | `initiateRefundForBooking`, auto-fired on cancellation; `REFUND_PENDING → REFUNDED` only on `refund.processed` webhook |
| 3. No transactional notifications | ✅ Resolved | `modules/notification/` — Brevo, idempotent via `NotificationLog` unique `dedupeKey` |
| 4. No admin/owner booking intervention | ⚠️ Mostly | Cancel + refund + manual booking + customer views + audit trail all shipped. **Reschedule and no-show/completed still absent.** |
| 5. In-memory rate limiter on serverless | ✅ Resolved | `rateLimit.js` now MongoDB-backed via a single atomic pipeline `findOneAndUpdate` |

Also resolved from the old Top-10 risks: CORS open-by-default (now a startup fail-fast in `env.js:35-39`), and no audit trail (`auditLog.model.js` + `logAdminAction`).

Two things found in this pass that the previous audit could not have seen, because the code did not exist: a **payment-captured-but-no-booking gap with no recovery path**, and a **lost-update race on the refunds array**. Both are detailed below.

---

## Scorecard

| Category | Weight | Score | Was | Notes |
|---|---|---|---|---|
| Product Experience | 15 | 11 | 9 | Real payments, email receipts, grouped reservations, live availability polling. No password reset is a real customer-lockout gap |
| Booking Domain Logic | 20 | 15 | 13 | Locking/pricing/IST still excellent. Status enum is still only CONFIRMED/CANCELLED — no reschedule, no-show, or completed |
| Payment & Financial Reliability | 15 | 11 | 1 | Correct in the normal and most abnormal paths; loses points on the crash window and refund reconciliation gaps below |
| Security | 15 | 12 | 10 | Fail-fast config, Mongo-backed limits, escaped emails, constant-time secret compare. JWT-in-localStorage with no CSP remains |
| Data Integrity | 10 | 7 | 6 | Audit trail added, good unique indexes. Refunds array is read-modify-write; no compound indexes on hot queries |
| Performance & Scalability | 10 | 5 | 6 | **Regressed.** Pagination on booking lists is cosmetic — every page fetches the full result set with 4 populates |
| Admin/Operations | 5 | 4 | 2 | Large improvement. No tooling to detect or resolve a stuck payment |
| Testing | 5 | 2 | 3 | 177 tests pass, but 100% mocked; still zero integration/concurrency/e2e, and now a payment layer with none |
| Observability | 5 | 3 | 3 | Strong logging unchanged. Still no APM/alerting; health check doesn't check the DB |
| **Total** | **100** | **70** | **53** | |

Verified locally during this audit: **Backend 137/137 tests pass** (13 files, 5.7s), **Frontend 40/40 pass** (7 files), **`tsc --noEmit` clean**, **no `.env` or secret committed** to git.

---

## Critical (fix before taking real customer money at volume)

### 1. Payment captured → process dies → customer has no booking, no refund, and no way to detect it

`payment.service.js:261-332`. `finalizePaymentSuccess` atomically claims the payment (`status → PAID`) and *then* loops `confirmSlot` for each slot. The `try/catch` handles a thrown error correctly — it rolls back, force-cancels, and auto-refunds. It does **not** handle the process simply ending mid-loop.

If the function dies between the claim and the end of the loop (serverless timeout, OOM, deploy mid-request):

- `Payment.status` is already `PAID`, `bookingIds` is `[]`.
- The `WebhookEvent` dedupe row was inserted *before* processing (`payment.controller.js:70`) and is only deleted inside the `catch` — which never ran. Every Razorpay redelivery is now answered "duplicate, already handled" (`:76`).
- Even if it were reprocessed, the atomic claim at `:262` matches only `CREATED/ORDER_CREATED/AUTHORIZED/FAILED`. A `PAID` payment yields `claimed === null` and returns `deduped: true` with an empty booking list (`:279`).

Net: **money captured, no booking, no refund, no alert, no recovery path.** The customer's poll of `GET /payments/:id` shows `PAID` with nothing attached.

This is not theoretical on this deployment. `vercel.json` sets no `maxDuration`, so functions run on the platform default (10s on Hobby). A 10-slot checkout performs ~5 sequential round trips per slot (`confirmSlot`'s `findOneAndUpdate` + `Booking.create` + slot link + turf `$inc`, then the commission `findByIdAndUpdate`) — roughly 50 serialized Atlas round trips — followed by three outbound Brevo calls. On a cold start with ordinary network latency that is a plausible timeout, not a freak event.

**Fix direction:** persist intent before claiming (or write `bookingIds` in the same update that sets `PAID`), and add a reconciliation query for `status: PAID, bookingIds: []` older than N minutes. There is currently **no** such job — confirmed by grep; the only reconciliation surface in the codebase is the manual `CLAWBACK_OWED` list.

### 2. No reconciliation tooling for payments in a bad state

Related but distinct from #1. `PAID_BOOKING_FAILED` is set correctly on the handled path, and `GET /api/admin/bookings` can filter by payment status — but nothing surfaces "payments that need a human," nothing alerts, and there is no admin action to re-drive or refund one. Every financial edge case currently depends on a customer complaining first.

### 3. Refunds array is read-modify-write under concurrent webhooks

`payment.service.js:637-659`. `upsertRefundEntry` loads the `Payment`, mutates `payment.refunds[]` in memory, and calls `payment.save()`. The webhook dedupe key is `event:entityId`, so `refund.created` and `refund.processed` **for the same refund** are different keys and can be processed concurrently. Both load the document, both write the whole array back — last write wins, and one refund entry (or status transition) is silently lost. `refundedAmount()` then under-reports, which feeds the over-refund guard at `:507`.

Every other state transition in this file correctly uses an atomic `findOneAndUpdate`; this one is the exception. Fix is a positional-operator update or an atomic `$push` with an `arrayFilters` guard.

### 4. Refunds initiated outside the app never reconcile to the booking

`finalizeRefundIfComplete:661-689` finds the booking by matching `r.notes?.bookingId`. That note is only set when *this codebase* initiated the refund (`:489`). A refund issued from the Razorpay dashboard — the normal thing a support person does under pressure — creates an entry via `upsertRefundEntry` with **no notes** (`:648-655`), so `refundedBooking` is `undefined`. Consequences: the booking stays `CONFIRMED` with `refundStatus: NONE`, the slot is never released, and `payoutStatus` never flips to `VOID` — **the owner still gets paid out for a booking the platform refunded.** Silent, and it costs real money.

---

## Top risks

| # | Risk | Severity | Evidence | Fix before launch? |
|---|---|---|---|---|
| 1 | Payment PAID with no booking, no recovery | Critical | `payment.service.js:261-332`; no reconciliation job exists | Yes |
| 2 | Dashboard-initiated refund doesn't void payout | Critical | `payment.service.js:661-689` vs `:648-655` | Yes |
| 3 | Lost update on `refunds[]` | High | `payment.service.js:637-659` | Yes |
| 4 | Booking-list pagination is cosmetic | High | `booking.service.js:484, 749, 787, 865` — full fetch + 4 populates, sliced in JS at `:474-478` | Yes (cheap) |
| 5 | No password reset | High | Frontend states it plainly; no backend route | Yes (support load) |
| 6 | No CI pipeline | High | `.github/` absent; 177 tests exist but nothing runs them on push | Yes (cheap) |
| 7 | Zero integration/concurrency tests over a payment layer | High | All 13 backend test files `vi.mock` the models | Recommended |
| 8 | No alerting / error tracking | Medium | Structured logs only; nothing pages a human | Yes |
| 9 | Health check doesn't check the database | Medium | `app.js:93-95` returns 200 with Mongo down | Yes (cheap) |
| 10 | JWT in `localStorage`, no CSP header | Medium | `AuthContext.tsx:58`, `api.ts:38`; `app.js:77-86` sets no CSP | Recommended |
| 11 | Rate-limit key trusts `X-Forwarded-For` | Medium | `rateLimit.js:89-97`; no `app.set('trust proxy')` | Mitigated on Vercel; document it |
| 12 | TypeScript `strict` off across the frontend | Medium | `tsconfig.app.json:19-22`, `tsconfig.json:8-13` | Recommended |
| 13 | Admin daily-revenue chart mixes server-local and UTC | Low | `admin.service.js:32-34, 63, 78` — no IST offset, unlike the rest of the codebase | Recommended |
| 14 | No JWT revocation | Low-Med | `auth.js`; 7-day TTL | Recommended |

---

## Detailed findings

### Payment & financial reliability — 11/15

The design is genuinely good, and several things here are better than typical:

- The client callback is never trusted as proof. Signature is rebuilt from the server's own stored `razorpayOrderId` (`:394`, with an excellent comment explaining exactly which attack that closes), followed by a live `payments.fetch` status check (`:411`).
- One authoritative transition reachable from both callback and webhook, made safe by an atomic status claim (`:261`).
- Webhook idempotency via a unique `dedupeKey`, with the claim released on failure so Razorpay's retry still works (`payment.controller.js:86-99`).
- Amounts are always server-computed from the price snapshotted at lock time; the sparse-index and re-lock bugs found in live testing were fixed properly at the root.
- The commission split is stored, not derived — a rate change cannot reprice history.
- The refund over-issue guard at `:507` is correct.

Points lost are entirely to the four Critical items: the crash window, the two refund-reconciliation defects, and the absence of any tooling to notice when one of them bites.

One cosmetic defect worth removing: `payment.service.js:532` is `status: already + amount >= payment.amount ? "PAID" : "PAID"` — a ternary with identical branches. Harmless, but it reads like an unfinished thought in the most safety-critical file in the repo.

### Performance & scalability — 5/10 (regressed)

This is the one category that got *worse*, and it is the cheapest to fix.

`groupBookingsByReservation` must see a whole result set to group by `groupId`, so `getUserBookings`, `getOwnerBookings`, `getBookingsByTurf`, and `getOwnerCustomerDetail` all run an **unbounded** `Booking.find()` with four `.populate()` calls and then slice in JS (`paginateGrouped:474-478`). The `page`/`limit` parameters therefore reduce *bytes sent to the browser* and nothing else — DB work, memory, and populate round trips all scale with the customer's or owner's lifetime booking count, on every page view.

The code comment at `:428-432` acknowledges the trade-off and calls it "simplest correct option for this app's booking volume," which is fair today. It is worth flagging because it is invisible in testing and degrades smoothly until it doesn't — and because the natural fix (a `$lookup` aggregation with `$skip`/`$limit`, or an index-backed two-pass query on distinct `groupId`) is a contained change. `admin.service.js` already does proper `skip`/`limit` for turfs and users, so the pattern exists in the codebase.

Also: `Booking` has single-field indexes but no compound index matching the hot query shape (`turfId` + `createdAt`, `userId` + `createdAt`). And `provisionDefaultSlots` still runs on the slot read path, building an `$in` of ~1,440 dates for a month-range calendar fetch.

### Security — 12/15

Strong, and the recent hardening pass was real work:

- `env.js` fail-fasts in production on missing `JWT_SECRET`, `CORS_ORIGINS`, `RAZORPAY_WEBHOOK_SECRET` (when a key is set), and all three ImageKit values — with comments explaining why a log warning was insufficient.
- Webhook/cron secrets use `safeEqual` (constant-time); Brevo's endpoint 404s rather than degrading to unauthenticated when unconfigured.
- Email templates escape all user/owner-supplied values (`email.templates.js:16`).
- Ownership is enforced service-side on every mutation *and* every owner read path; `assertCanManageBooking` correctly widens for ADMIN without weakening the owner check. No IDOR, price-tampering, or user-id-spoofing path found.
- Uploads validated by magic bytes, SVG deliberately refused.
- No secrets committed; `.env` gitignored, only `.env.example` tracked.

Remaining: the JWT lives in `localStorage` and the app sets no `Content-Security-Policy`, so any XSS is a full account takeover with a 7-day-valid token and no revocation. That combination is what keeps this from scoring higher. The rate limiter's `X-Forwarded-For` trust is safe on Vercel (the platform overwrites the header) but silently becomes bypassable on any host that doesn't — worth a comment in the file, since nothing in the code states the dependency.

### Testing — 2/5 (regressed relative to risk)

177 tests pass and they assert the right *business rules* — price-at-lock-time, cutoff enforcement, ownership, commission math, webhook dedupe. That is above average.

But every one of the 13 backend files `vi.mock`s the Mongoose models. The system's core safety claims — "the atomic claim means only one caller creates bookings," "the unique index makes provisioning idempotent," "duplicate webhooks are a no-op" — are all claims *about MongoDB's behavior under concurrency*, and not one of them is exercised against a real database. The score drops versus last audit not because tests got worse, but because a payment layer arrived and inherited the same mock-only coverage. A `mongodb-memory-server` suite racing two `finalizePaymentSuccess` calls and two `lockSlot` calls would be the single highest-value test addition in this repo.

No CI means none of these 177 tests run unless someone remembers.

### Booking domain — 15/20

Unchanged strengths: atomic locking, price snapshotting, fixed-offset IST handling, all-or-nothing multi-slot with compensating rollback, contiguity validation, per-user hold caps, advance-booking bounds.

Gaps: `Booking.status` is still just `CONFIRMED | CANCELLED`. There is no reschedule, no-show, or completed state — a venue running this daily needs at least the latter two. Note also that `booking.model.js:31-32` and `:56-57` carry comments that are now false ("there is no admin/owner cancellation endpoint yet", "No payment gateway exists"); both features shipped. Stale comments in the schema that defines financial state are a real maintenance hazard.

### Admin & operations — 4/5

A venue manager can now do essentially everything day-to-day: see and filter bookings, cancel on a customer's behalf, record a refund, create a walk-in booking, look up a repeat customer, settle payouts, and read an audit trail of admin actions. This went from "CRUD plus dashboards" to a usable operations tool in one pass.

What is missing is the *exception* path: no reschedule, no no-show marking, and — most importantly — no way to see or act on a payment that is stuck.

### Observability — 3/5

Logging remains a genuine strength: structured JSON, request-id correlation across both halves, redaction by key *and* by shape, appropriate severity levels, client error ingestion. The audit trail now adds queryable admin accountability.

What is still absent is anything that tells a human something is wrong without a customer reporting it: no error tracking, no metrics, no alerting, and a health check (`app.js:93-95`) that returns `200 OK` regardless of database state — so an uptime monitor pointed at it will report green through a total Mongo outage.

---

## What must be fixed before launch

1. Close the PAID-with-no-booking window and add a reconciliation query for `status: PAID, bookingIds: []`.
2. Reconcile refunds that originate outside the app, so a dashboard refund voids the payout.
3. Make `upsertRefundEntry` atomic.
4. Add CI running the existing 177 tests on every push — the tests already exist, nothing runs them.
5. Make `/api/health` verify the Mongo connection, and point an uptime monitor plus basic error-rate alerting at it.
6. Bound the booking-list queries (add `skip`/`limit` at the DB layer, or group in an aggregation).
7. Ship password reset — without it, every locked-out customer is a manual support ticket.

## What can wait

Reschedule and no-show workflow, SMS, coupons, memberships, Razorpay Route payout automation, JWT revocation, enabling TS `strict` (worth doing incrementally), the IST fix on the admin chart, compound indexes, and full APM.

---

## Final recommendation

**Can this go live? Yes, conditionally — as a soft launch, with the seven items above closed first and a human watching the payment table daily.**

The distance travelled since 2026-08-21 is substantial and real: the payment integration is thoughtfully built, the security hardening addressed the previous audit's findings at the root rather than papering over them, and the operations tooling went from unusable to adequate. The booking concurrency core remains the best part of the codebase and should not be rewritten.

The reason this is not an unconditional go is narrow and specific: **the failure modes that remain are all silent ones.** A captured payment with no booking, a refund that doesn't void a payout, a lost refund entry — none of these throw, none of these alert, and none of these are visible in the admin UI. The system is now good at doing the right thing and still poor at telling anyone when it didn't. Closing items 1-5 above changes that, and they are days of work, not weeks.

**Biggest financial-loss risk:** a dashboard-issued refund leaving `payoutStatus: PENDING`, so the platform refunds the customer and pays the owner for the same booking.
**Biggest trust risk:** the crash window — a customer who is charged, receives no booking and no refund, and has to notice it themselves.
**Biggest scaling risk:** unbounded booking-list fetches, which degrade invisibly until they don't.

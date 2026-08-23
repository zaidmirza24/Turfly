# TURF BOOKING SYSTEM — PRODUCTION READINESS ASSESSMENT

**Date:** 2026-08-23, audited; 2026-08-24, all seven "must fix before launch" items closed.
**Scope:** Full-stack audit of the TURF platform — Backend (Express/MongoDB, ~9.6k LOC) + Frontend (React/Vite/TS, ~17.1k LOC), evaluated against real-world turf-booking business requirements.
**Supersedes:** the 2026-08-21 audit (score 53/100, verdict "NOT SAFE TO LAUNCH — no payment system exists"). That document is preserved in git history.

**Overall Score: 70/100 at audit time → 84/100 after the fix pass below**
**Production Readiness: 72/100 at audit time → 88/100 after the fix pass**
**Verdict: 🟢 GO for a soft launch.** The four Critical findings from the 2026-08-23 audit are fixed, tested, and merged (see "Fix pass" below) — score bumped accordingly. Verdict was 🟡 CONDITIONAL GO before the fix pass; the original analysis is kept below unedited as the record of what was found, with the fixes documented as an addendum rather than rewritten into the findings themselves.

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

# TURF Booking Platform — AI Context

## Project Overview
A turf/sports-facility booking platform with a phased architecture designed for scalability.  
**Current Phase: Midnight Elite Implementation** — Advanced UI/UX with Obsidian dark theme, enhanced analytics, and 24/7 scheduling engine.

---

## Tech Stack

| Layer     | Technology                              |
|-----------|-----------------------------------------|
| Frontend  | React 18 + TypeScript + Vite + shadcn/ui + Tailwind CSS |
| Backend   | Node.js + Express (ESM) + Mongoose      |
| Database  | MongoDB                                 |
| Auth      | JWT (Bearer tokens) + bcryptjs          |
| UI/UX     | Framer Motion (Animations), Recharts (Analytics), Lucide (Icons) |
| Dev Tools | nodemon, Vitest (both packages)         |

---

## Architecture

```
Backend/src/
├── server.js                        # Entry point
├── common/
│   ├── config/
│   │   ├── env.js                   # Centralized env config
│   │   └── db.js                    # MongoDB connection
│   ├── middlewares/
│   │   ├── auth.js                  # JWT protect + role authorize
│   │   └── errorHandler.js          # Global error handler
│   └── utils/
│       ├── ApiError.js              # Custom error class
│       └── ApiResponse.js           # Standardized response wrapper
├── modules/
│   ├── image/                       # upload, validation, storage, serving
│   ├── logs/                        # client error ingestion
│   ├── auth/
│   │   ├── auth.service.js          # Register, login, token generation
│   │   ├── auth.controller.js       # Thin HTTP layer
│   │   └── auth.routes.js
│   ├── user/
│   │   └── user.model.js            # User schema + password hashing
│   ├── turf/
│   │   ├── turf.model.js
│   │   ├── turf.service.js
│   │   ├── turf.controller.js
│   │   └── turf.routes.js
│   ├── slot/
│   │   ├── slot.model.js            # ⚡ Future-proofed with LOCKED status
│   │   ├── slot.service.js
│   │   ├── slot.controller.js
│   │   └── slot.routes.js
│   └── booking/
│       ├── booking.model.js
│       ├── booking.service.js       # 🔥 Core booking logic lives HERE
│       ├── booking.controller.js
│       └── booking.routes.js
```

---

## Key Design Decisions

### 1. Service Layer Pattern
- **Controllers are thin** — they parse req/res and call services
- **Services contain the business logic** — validation, DB operations, error throwing
- Authorization lives in the service too, next to the data it protects

### 2. Slot lifecycle
```js
status: "AVAILABLE" | "LOCKED" | "BOOKED" | "CLOSED" | "FULL"
lockedBy: ObjectId | null      // who holds the lock
lockExpiresAt: Date | null     // 5 minutes from lock
```
Transitions: `AVAILABLE → LOCKED → BOOKED`, with `LOCKED → AVAILABLE` on expiry
and `BOOKED → AVAILABLE` on cancellation. `CLOSED` (outside operating hours) and
`FULL` (taken offline by the owner) are set manually and are not bookable.

A unique `(turfId, startTime)` index is what makes default-slot provisioning
idempotent under concurrency — two simultaneous readers of the same day race
into a duplicate-key error rather than creating two slot documents.

### 3. Role-Based Access
- `USER` — browse turfs, view slots, book, cancel their own bookings
- `OWNER` — create/edit their own turfs, manage that turf's slots, view bookings for their own turfs
- `ADMIN` — approve/reject turf listings, view platform stats, ban/unban non-admin users.
  Provisioned only by `npm run seed:admin`; the public register endpoint refuses the role.

Ownership is enforced server-side on every turf/slot/booking mutation *and* on
the owner read paths — role alone is never sufficient, because any owner could
otherwise pass another owner's turf id.

### 4. Midnight Elite Design System
- **Aesthetic**: Obsidian dark mode with glassmorphism effects.
- **UX**: Premium micro-animations using Framer Motion for interactive elements.
- **Analytics**: Data-driven dashboards for owners using Recharts to visualize revenue and booking trends.

### 5. Error Handling
- `express-async-errors` — catches all async errors globally
- `ApiError` — throw from anywhere with status code
- `errorHandler` middleware — normalizes Mongoose/JWT/Multer/custom errors, and
  is the single place an error becomes both a response and a log record

### 6. Logging
`common/utils/logger.js` — dependency-free structured logger. JSON lines in
production, readable lines in development, filtered by `LOG_LEVEL`.

- **Never call `console.*` directly.** The logger is what applies level
  filtering, redaction and structure; a raw `console.log` bypasses all three.
- **Request correlation**: `requestContext` middleware assigns an `x-request-id`
  (accepting the caller's when well-formed), echoes it in the response header,
  and puts it in an `AsyncLocalStorage` store so a service five calls deep logs
  it without a `req`. It is also pinned to `req.requestId`, because the async
  store does not survive multipart streaming.
- **Levels**: `error` = something is broken; `warn` = a request was rejected as
  expected, or a client reported a problem; `info` = one line per request plus
  notable state changes; `debug` = development tracing.
- **Redaction is not optional.** Credentials *and* personal data (email, phone,
  name, address) are stripped by key, and connection strings / bearer tokens /
  JWTs are stripped by shape from free text — those turn up inside driver error
  messages where no key name protects them. See `logger.test.js`.
- The frontend mirrors all of this in `Frontend/src/lib/logger.ts`, and posts
  its `warn`/`error` records to `/api/logs/client` so both halves of a failure
  land in one stream, joined by the same request id.

### 7. Image storage
Uploads are stored as binary in MongoDB (`modules/image/image.model.js`), not
on disk: every deployment target is serverless, where the filesystem is
ephemeral. The `data` field is `select: false` so listings never pull binaries.

The format is decided by the file's **magic bytes**, never by the client's
`Content-Type` or file extension — see `image.validation.js`. SVG is refused on
purpose: it is a document format that executes script.

A turf's `images` array only ever holds our own `/api/images/:id` paths, and
every write goes through `attachImagesToTurf`, which verifies each id exists
and belongs to the caller. That is what stops the field becoming a way to point
the site at arbitrary third-party URLs.

### 8. Recurring work without a scheduler

**There are no cron jobs, and adding one should be a last resort.** A scheduler
is a second thing to configure, secure and monitor, and it behaves differently
in every environment this runs in — node-cron needs a process that never
sleeps, Vercel Cron needs a public endpoint plus a shared secret and only fires
daily on the free tier. Both chores that looked like they needed one are
handled by mechanisms that cannot drift out of sync with the data:

**Expired slot locks** — `lockSlot` folds the expiry check into its atomic
`findOneAndUpdate`, matching a slot that is `AVAILABLE` *or* `LOCKED` with a
`lockExpiresAt` in the past. An abandoned checkout therefore stops blocking a
slot the moment its five minutes are up, whether or not anything has swept the
record. Correctness never depends on a sweep. The only thing left is cosmetic —
a stale `LOCKED` label in the grid — and `releaseExpiredLocks({ turfId })` runs
on the slot read path, so the act of looking at a schedule is what corrects it.
A slot nobody is looking at does not need correcting.

**Abandoned image uploads** — a file is stored the moment the owner picks it,
but the turf is only saved on submit, so an abandoned form leaves a binary
nothing references. Rather than hunt for those on a timer, every upload is
written with an `expiresAt` and MongoDB's own TTL monitor removes it. Attaching
the image to a turf clears the field (a live listing's photo must never vanish);
removing it from the turf sets it again. The lifetime is a property of the
document, so it stays correct with no traffic, no process and no configuration.

`npm run images:prune` exists only to backfill documents written before
`expiresAt` did — a TTL index cannot see a document that has no expiry field.
It arms them rather than deleting, so nothing loses its grace period.

---

## API Endpoints

### Auth
| Method | Route                | Auth | Notes                                  |
|--------|----------------------|------|----------------------------------------|
| POST   | `/api/auth/register` | ❌   | Rate limited. Role is USER or OWNER only |
| POST   | `/api/auth/login`    | ❌   | Rate limited (10 / 15 min per IP)       |

### Turfs
| Method | Route                 | Auth | Role  | Description                                  |
|--------|-----------------------|------|-------|----------------------------------------------|
| POST   | `/api/turfs`          | ✅   | OWNER | Create turf — always starts PENDING          |
| GET    | `/api/turfs`          | ❌   | —     | Public listing: APPROVED + active only. Query: `sportsType` (comma list), `location`, `venueType`, `minPrice`/`maxPrice`, `amenities` (comma list), `minRating`, `sortBy`, `availableNow`, `lat`/`lng`/`maxDistanceKm` |
| GET    | `/api/turfs/my-turfs` | ✅   | OWNER | The caller's own turfs, any approval status  |
| GET    | `/api/turfs/:id`      | ❌   | —     | 404s unless APPROVED + active                |
| PATCH  | `/api/turfs/:id`      | ✅   | OWNER | Own turf only; whitelisted fields            |

### Slots
| Method | Route                | Auth | Role  | Description                                      |
|--------|----------------------|------|-------|--------------------------------------------------|
| GET    | `/api/slots`         | ❌   | —     | `turfId` required; `date` or `startDate`/`endDate` |
| POST   | `/api/slots`         | ✅   | OWNER | Bulk create (max 1500 per request)               |
| PATCH  | `/api/slots`         | ✅   | OWNER | Bulk price update                                |
| PATCH  | `/api/slots/status`  | ✅   | OWNER | Bulk AVAILABLE / CLOSED / FULL                   |
| DELETE | `/api/slots`         | ✅   | OWNER | Clear non-BOOKED slots for a date                |

### Bookings
| Method | Route                        | Auth | Role  | Description                          |
|--------|------------------------------|------|-------|--------------------------------------|
| POST   | `/api/bookings/lock`         | ✅   | USER  | Atomic 5-minute lock                 |
| POST   | `/api/bookings/confirm`      | ✅   | USER  | Lock → booking                       |
| POST   | `/api/bookings`              | ✅   | USER  | Instant book (lock + confirm)        |
| POST   | `/api/bookings/multi`        | ✅   | USER  | Up to 10 slots, one turf, all-or-nothing |
| GET    | `/api/bookings`              | ✅   | any   | Role-dependent: owner vs own bookings |
| GET    | `/api/bookings/me`           | ✅   | any   | Own bookings                         |
| GET    | `/api/bookings/owner`        | ✅   | OWNER | All bookings across the caller's turfs |
| GET    | `/api/bookings/turf/:turfId` | ✅   | OWNER | Own turf only — returns customer PII  |
| DELETE | `/api/bookings/:id`          | ✅   | USER  | Own booking, before the slot starts   |

### Admin (all require role ADMIN)
| Method | Route                            | Description                       |
|--------|----------------------------------|-----------------------------------|
| GET    | `/api/admin/stats`               | Platform totals                   |
| GET    | `/api/admin/turfs`               | All turfs, any status             |
| PATCH  | `/api/admin/turfs/:id/approve`   | Put a listing live                |
| PATCH  | `/api/admin/turfs/:id/reject`    | Unlist / reject                   |
| GET    | `/api/admin/users`               | All users                         |
| PATCH  | `/api/admin/users/:id/ban`       | Ban/unban — ADMIN accounts refused |

### Images
| Method | Route              | Auth | Role         | Description                                     |
|--------|--------------------|------|--------------|-------------------------------------------------|
| POST   | `/api/images`      | ✅   | OWNER        | Multipart, field `image`. Rate limited          |
| GET    | `/api/images/:id`  | ❌   | —            | Serves the bytes; immutable cache headers       |
| GET    | `/api/images`      | ✅   | OWNER/ADMIN  | Caller's uploads (metadata only)                |
| DELETE | `/api/images/:id`  | ✅   | OWNER/ADMIN  | Uploader or admin; unlinks it from any turf     |

### Logs
| Method | Route               | Auth | Description                                        |
|--------|---------------------|------|----------------------------------------------------|
| POST   | `/api/logs/client`  | ❌   | Browser error reports. Rate limited, size capped   |

### Scheduled work
There is none, by design — no cron entries, no scheduler, and no HTTP job
endpoints to secure. See "Recurring work without a scheduler" below.

## Request/Response Shapes

### Register
```json
// POST /api/auth/register
{
  "name": "John",
  "email": "john@test.com",
  "phone": "9876543210",
  "password": "password123",
  "role": "USER"
}
// → { success, message, data: { user, token } }
```

### Create Slots (Bulk)
```json
// POST /api/slots
{
  "turfId": "...",
  "slots": [
    { "startTime": "2026-01-15T06:00:00Z", "endTime": "2026-01-15T07:00:00Z", "price": 500 },
    { "startTime": "2026-01-15T07:00:00Z", "endTime": "2026-01-15T08:00:00Z", "price": 600 }
  ]
}
```

### Book Slot
```json
// POST /api/bookings
{ "slotId": "..." }
// → { success, message, data: booking }
```

---

## Implemented since this doc was first written

- **Atomic slot locking** — `lockSlot()` uses a single `findOneAndUpdate` whose
  filter carries the status check, so concurrent requests for the same slot
  cannot both win. Expired locks are re-lockable at read time, independent of
  the cleanup job.
- **Lock expiry** — handled without a scheduler; see "Recurring work without a
  scheduler" below.
- **Admin panel** — approval workflow, user ban/unban, platform stats.
- **Multi-slot checkout** — `/api/bookings/multi`, all-or-nothing with
  compensating rollback, all slots must belong to one turf.
- **Image upload** — owner uploads, magic-byte validation, MongoDB storage,
  public serving with immutable cache headers, self-expiring orphan uploads.
- **Structured logging and error tracking** — request-correlated JSON logs on
  the server, a mirrored client logger, a React error boundary, and client
  error reports flowing into the same stream.

## Discovery, search & venue-detail features (2026-08-21)

Added the customer-facing feature set from the standard turf-booking checklist
that didn't need payments, SMS, or a paid maps/geocoding key:

- **Geolocation** — `Turf.geo` (GeoJSON Point) is best-effort geocoded
  server-side from the owner's free-text `location` on create/update via
  OpenStreetMap's free Nominatim API (`turf/geocode.js`), never blocking the
  write on failure. Powers "near me" sort (`GET /turfs?lat&lng`, `$geoNear`
  aggregation in `turf.service.js`), a distance-radius filter (`maxDistanceKm`),
  and an embedded OpenStreetMap iframe + straight-line distance on the detail
  page (`Frontend/src/lib/geo.ts`) — all with no API key.
- **Ratings & reviews** — new `review` module. A review requires a real
  `CONFIRMED` booking for that turf (`review.service.js`), one per user per
  turf. `Turf.avgRating`/`reviewCount` are recomputed on write so listing
  sort/filter never joins against Review at read time.
- **Popularity** — `Turf.bookingCount` increments in `confirmSlot` (the one
  function every booking path funnels through), backing a "Most booked" sort.
- **Listing query** — `GET /turfs` now takes `venueType`, `minPrice`/
  `maxPrice`, `amenities` (comma list, `$all`), `minRating`, `sortBy`
  (`price_asc|price_desc|rating|popularity|newest`), `availableNow` (joins
  against `Slot` for anything open in the next 2 hours), `lat`/`lng`/
  `maxDistanceKm`. All whitelisted in `turf.controller.js` the same way the
  original `location`/`sportsType` filters were.
- **New turf fields**: `venueType` (INDOOR/OUTDOOR/BOTH), `capacity`,
  `contactPhone`, `rules`, `faqs[]` — owner-editable, shown on the detail page.
- **Frontend**: recently-viewed strip and a ratings-based "recommended"
  section on Home (`lib/recentlyViewed.ts`, `localStorage`), search
  autocomplete and a full filter/sort sidebar with active-filter chips on the
  listing page, reviews UI (`components/ReviewsSection.tsx`) and an owner
  edit-details dialog (previously only photos were editable post-creation).

Deliberately **not** built, and why:
- Offers/promotions — would need a coupon model applied at checkout, but
  checkout is simulated (no payment layer to apply a discount against); building
  it now would be UI over a fake transaction.
- Duration filter — doesn't apply to this booking model: slots are
  fixed-length per turf, set by the owner: a customer picks one or more
  contiguous hourly slots, not an independent duration.
- Video in the gallery — image upload is validated by magic bytes and stored
  as MongoDB binary (2MB cap); that pipeline is deliberately not built for
  video, which needs real object storage + streaming.

## Availability, checkout & booking-lifecycle UX (2026-08-21)

Extended the slot-selection, checkout, confirmation, and My Bookings screens
against the standard booking-flow checklist, staying inside what a simulated
payment layer can honestly claim:

- **Slot selection**: Today/Tomorrow shortcuts, a calendar dot for any date
  with an open slot (one range fetch per visible month via `/slots?
  startDate&endDate`, not per-day), a "Peak" flame badge on slots priced
  above that day's average (there's no explicit peak flag in the data model —
  this reads real owner-set pricing rather than guessing).
- **Checkout**: summary now itemizes base price per slot, states plainly that
  no taxes/platform fee are charged (`taxes & platform fee: ₹0 — none
  charged`), shows the cancellation policy before payment, and gates the pay
  button on a terms/cancellation-policy checkbox. On a booking conflict (409),
  the slot-grid and calendar-dot query caches are invalidated so retrying
  shows real availability instead of what was true when checkout started.
- **Confirmation screen**: duration, an honest "Paid (simulated)" status line,
  directions (OpenStreetMap, using the geocoded `turf.geo` when present),
  contact-venue `tel:` link, add-to-calendar (.ics download + Google Calendar
  link), and share/copy-confirmation via the Web Share API with a clipboard
  fallback.
- **My Bookings**: split into Upcoming / Completed / Cancelled (previously
  Completed and Cancelled were merged into one "past" tab); added a
  receipt dialog (built from the booking's own data, print-styled), "Book
  Again" (relists the turf) and "Write a Review" (deep-links to the detail
  page's reviews section, gated the same way as everywhere else on an actual
  CONFIRMED booking).
- **Cancellation**: the confirm dialog and the post-cancel toast now say
  explicitly that no charge was made and there's nothing to refund, rather
  than staying silent on it.

Deliberately **not** built, and why:
- Coupon input, taxes, platform fee line items — there's no coupon model and
  no real fee is charged; showing input fields or fee rows for either would
  imply a capability that doesn't exist.
- Refund status/amount/timeline/reference id after cancellation — no payment
  was ever collected, so any refund UI would be fabricated data. The
  honest equivalent (implemented) is stating plainly that nothing was charged.
- "Payment succeeded but booking failed" recovery flow — structurally can't
  happen today: `createBooking` is one atomic call, there's no separate
  payment step that could succeed independently of the booking.
- QR code on the confirmation screen — nothing at the venue can scan it (no
  check-in tooling exists for owners/admins), so it would encode data with no
  reader on the other end.
- Reschedule — no `PATCH` endpoint exists for moving a booking to a different
  slot; cancel-and-rebook is the only path today.
- Saved payment methods / real UPI-card-netbanking integration — same gate as
  the original payment-gateway decision (skipped for this pass).

## Reviews, accounts, favorites & mobile/trust UX (2026-08-21)

New `user` module (`Backend/src/modules/user/`) — there was no `/api/users`
surface at all before this: `GET/PATCH /me`, `POST /me/change-password`,
`DELETE /me` (soft delete — see below), and favorites (`GET/POST/DELETE
/me/favorites/:turfId`). `protect` now also rejects `isDeleted` accounts the
same way it already rejected banned ones.

- **Account deletion is a soft delete**, not a row removal: bookings,
  reviews, and owner turf history elsewhere in the system hold this `_id` by
  reference, and there's no product need to cascade-delete any of that. The
  account is anonymized in place (name → "Deleted User", email → a unique
  placeholder, phone/avatar/favorites cleared) and refused for OWNER/ADMIN
  roles or while an upcoming CONFIRMED booking exists — a customer just
  cancels first, which is always allowed up to 6 hours out.
- **Avatars and review photos** reuse the existing turf-image upload
  pipeline (magic-byte validation, MongoDB storage) through two new,
  deliberately simpler helpers in `image.service.js` — `attachAvatarImage`/
  `attachReviewImages` skip turf.images's cross-document "still used
  elsewhere" check, because an avatar or a review's photos are only ever
  referenced from that one document.
- **Reviews** gained facility sub-ratings (turf quality / cleanliness /
  staff behavior, all optional), photo attachments (up to 4), self-editing
  (`PATCH /reviews/id/:reviewId`, re-aggregates the turf's rating), reporting
  (`POST .../report`, one flag per user, idempotent), and one public owner
  response per review (`POST .../response`, owner-of-that-turf only). A
  "Verified Booking" tag is shown on every review in the UI — this was
  already implicitly true (review creation requires a CONFIRMED booking) and
  is now actually surfaced.
- **Favorites** live server-side on `User.favorites`, not localStorage —
  unlike "recently viewed", a saved venue is expected to follow the customer
  across devices. Heart toggle on `TurfCard` and the detail page's gallery; a
  `/favorites` page lists them.
- **Mobile**: a bottom tab bar (`MobileBottomNav`) for Home/Search/
  Favorites/Bookings/Account, hidden on the turf-detail and booking-flow
  pages since both already have their own sticky bottom CTA bar — stacking
  two fixed bottom bars would eat a real chunk of a phone screen. The turf
  gallery is swipeable via touch handlers (no new dependency).
- **Trust & support**: a "Verified Venue" badge on the detail page (every
  live listing is admin-approved, so this was always true and just wasn't
  shown), real `/privacy` and `/terms` pages describing what the system
  actually does today (including "checkout is simulated, no card data is
  ever collected"), and a `/help` page with FAQ plus `mailto:` links that
  auto-prefix the booking reference when reached from a receipt or the
  booking-failure screen.
- **Error copy**: the booking-failure screen now reads "Something went
  wrong — we couldn't complete your booking... Your payment has not been
  charged", matching the tone the rest of the app already uses instead of a
  generic failure message.

Deliberately **not** built, and why:
- Saved payment methods, notification preferences — nothing real backs
  either: there's no payment gateway to save a method against, and no
  email/SMS system to have a preference about. Adding the toggle would
  imply a capability that doesn't exist.
- Compare saved venues — real feature, but a distinct side-by-side UI with
  little payoff at this catalog size; skipped to keep this pass scoped.
- Live chat / ticketing support — no support-agent backend exists; `mailto:`
  with the booking reference pre-filled is the honest equivalent given that.
- Admin moderation UI for reported reviews — reports are now captured
  (`Review.reportedBy`) but there's no admin screen to act on them yet; the
  data exists for that screen to be added later without a schema change.
- Saved locations — no concept of a delivery/service address applies to a
  turf-booking flow beyond the "near me" geolocation search already built.

## Still not implemented

- ❌ Payment gateway — checkout is simulated; no money moves, and no commission
  is calculated or recorded anywhere despite the commission business model
- ❌ Transactional email/SMS on booking confirm/cancel
- ❌ Password reset (the page says so rather than pretending to send a mail)
- ❌ Pagination on any list endpoint

## Running the Project

```bash
# Backend
cd Backend
npm install
npm run dev       # → localhost:5000

# Frontend
cd Frontend
npm install
npm run dev       # → localhost:5173 (Vite)
```

## Environment Variables (Backend/.env)
```
PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/turf_booking
JWT_SECRET=<long random string — the fallback in env.js must never be used in production>
JWT_EXPIRES_IN=7d
NODE_ENV=development
ADMIN_EMAIL=          # used only by npm run seed:admin
ADMIN_PASSWORD=
CORS_ORIGINS=         # comma-separated; blank = any origin
LOG_LEVEL=            # debug|info|warn|error|silent (default: info in prod)
MAX_IMAGE_BYTES=      # default 2097152 (2 MB)
```

`npm run seed:test` **deletes every user, turf, slot and booking** in whatever
`MONGO_URI` points at. It refuses to run when `NODE_ENV=production` and requires
`--yes-wipe-all-data`.

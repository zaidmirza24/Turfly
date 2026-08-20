# TURF SaaS — Locked Feature Roadmap

**Business model:** Commission per booking (platform takes a % cut of every booking; owners don't pay upfront).
**Tenancy:** Multi-tenant marketplace — any turf owner can self-register and manage their own turf(s)/bookings independently.

---

## Phase 1 — MVP (locked)

### Customer
- Browse/search turfs (by city/location, sport type, price)
- View turf detail (photos, amenities, pricing, availability)
- Slot booking with real-time availability (atomic locking — already built)
- Online payment at booking time (commission taken here)
- Booking history + cancellation (with refund/cancellation policy)
- Basic profile (name, phone, email)

### Owner
- Self-registration + onboarding (submit turf details for admin approval)
- Create/edit turf listing, upload real photos
- Create/manage slots (already built)
- View bookings for their turf(s)
- View earnings (gross booking value − commission = payout owed)
- Revenue dashboard (already built — needs wiring to real data)

### Admin (platform)
- Approve/reject new turf listings before they go live
- View all turfs, owners, bookings, users (wire existing mock admin pages to real data)
- View platform-wide commission/revenue
- Suspend/ban a turf or user

### Platform infrastructure
- Real payment gateway (Razorpay/Stripe) with commission split logic
- Image upload (turf photos)
- Email/SMS notification on booking confirm + cancel (transactional)

---

## Phase 2 — fast follow (not yet locked)
- Ratings & reviews for turfs
- Owner payout automation (auto-transfer after commission cut)
- Refund policy automation / partial refunds
- Real-time slot updates via websockets
- Multi-city expansion tooling (city admin roles, city-based filters)
- Coupons/discount codes

## Later / backlog
- Recurring bookings (weekly slot subscriptions)
- Loyalty/rewards program
- Owner subscription tiers on top of commission
- Native mobile app
- Multi-language support

---

## Status vs current codebase (as of 2026-08-20)
Already implemented: auth (JWT, role-based incl. ADMIN), turf CRUD, slot bulk-create, atomic slot locking + expiry cleanup job, booking create/cancel, owner revenue dashboard (Recharts), turf approval workflow (PENDING/APPROVED/REJECTED, public listing only shows APPROVED), admin panel wired to real backend data (stats, turf approve/reject, user list + ban/unban), user ban enforcement in `protect` middleware, frontend route guards on `/owner` and `/admin`.

Not yet implemented (needed for Phase 1 lock): payment gateway + commission logic, image upload, transactional notifications (email/SMS on booking confirm/cancel).

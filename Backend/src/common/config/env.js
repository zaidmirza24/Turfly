import dotenv from "dotenv";
dotenv.config();

const NODE_ENV = process.env.NODE_ENV || "development";

// A missing signing secret must never fall back to a shipped literal — that
// literal is public (it's in this file's git history), so a fallback would
// let anyone forge a token for any user, including ADMIN. Failing startup
// loudly in production is the only safe behavior; local/dev/test keep a
// fixed fallback purely for convenience, where the stakes of a guessable
// secret are nil.
if (NODE_ENV === "production" && !process.env.JWT_SECRET) {
  throw new Error(
    "JWT_SECRET must be set in production — refusing to start with a fallback signing secret."
  );
}

// Same reasoning as JWT_SECRET: an unset webhook secret must never be treated
// as "webhooks disabled, ignore signatures" in production — that would accept
// forged payment-confirmation webhooks from anyone who finds the URL. Razorpay
// key/secret are allowed to stay unset (payments simply won't initialize,
// same posture as before this integration existed), but if the secret IS set
// the webhook secret must be too, and neither may ever silently no-op in prod.
if (NODE_ENV === "production" && process.env.RAZORPAY_KEY_ID && !process.env.RAZORPAY_WEBHOOK_SECRET) {
  throw new Error(
    "RAZORPAY_WEBHOOK_SECRET must be set in production whenever RAZORPAY_KEY_ID is — refusing to start accepting payments with unverifiable webhooks."
  );
}

// Left unset, the API would be reachable from any browser origin — a plain
// log warning was the previous behavior, which meant a forgotten env var
// silently shipped an open CORS policy. Same reasoning as JWT_SECRET above:
// a security-relevant default should never depend on someone reading a log
// line after the fact.
if (NODE_ENV === "production" && !process.env.CORS_ORIGINS) {
  throw new Error(
    "CORS_ORIGINS must be set in production — refusing to start with the API open to any browser origin. Set it to your deployed frontend's URL (comma-separated for more than one)."
  );
}

// Turf photos are stored on ImageKit, not in MongoDB (see
// image.model.js/image.service.js) — without these, every upload would fail
// and every existing listing would render broken images. Unlike
// Razorpay/Brevo, there's no reduced-functionality mode to fall back to, so
// this is required whenever the app is meant to actually serve traffic.
if (NODE_ENV === "production" && (!process.env.IMAGEKIT_PUBLIC_KEY || !process.env.IMAGEKIT_PRIVATE_KEY || !process.env.IMAGEKIT_URL_ENDPOINT)) {
  throw new Error(
    "IMAGEKIT_PUBLIC_KEY, IMAGEKIT_PRIVATE_KEY and IMAGEKIT_URL_ENDPOINT must all be set in production — refusing to start with image uploads/delivery broken."
  );
}

const env = {
  PORT: process.env.PORT || 5000,
  MONGO_URI: process.env.MONGO_URI || "mongodb://127.0.0.1:27017/turf_booking",
  JWT_SECRET: process.env.JWT_SECRET || "fallback_secret_change_me",
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "7d",
  NODE_ENV,
  ADMIN_EMAIL: process.env.ADMIN_EMAIL || "",
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || "",
  ADMIN_NAME: process.env.ADMIN_NAME || "Platform Admin",
  // Comma-separated list of allowed browser origins. Unset = allow any origin.
  CORS_ORIGINS: process.env.CORS_ORIGINS || "",
  // debug | info | warn | error | silent. Defaults to info in production,
  // debug elsewhere.
  LOG_LEVEL: process.env.LOG_LEVEL || "",
  // Max accepted image upload size in bytes (default 10 MB). Masters are
  // stored on ImageKit, not in MongoDB, so this is no longer bounded by
  // Mongo's 16 MB document limit — it exists to keep uploads reasonably fast
  // on mobile networks while still allowing full-quality DSLR/phone photos.
  MAX_IMAGE_BYTES: Number(process.env.MAX_IMAGE_BYTES || 10 * 1024 * 1024),

  // ── ImageKit (turf photo storage + delivery CDN) ──
  // Dashboard → Developer options → API keys.
  IMAGEKIT_PUBLIC_KEY: process.env.IMAGEKIT_PUBLIC_KEY || "",
  IMAGEKIT_PRIVATE_KEY: process.env.IMAGEKIT_PRIVATE_KEY || "",
  // Dashboard → Developer options → URL endpoint (e.g. https://ik.imagekit.io/yourid).
  IMAGEKIT_URL_ENDPOINT: process.env.IMAGEKIT_URL_ENDPOINT || "",

  // ── Razorpay ──
  // Server-side only. RAZORPAY_KEY_ID is the one value ever sent to the
  // frontend (via the create-order response), never read from a VITE_* var.
  RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID || "",
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET || "",
  RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET || "",

  // Minutes a slot stays reserved once a Razorpay order has been created for
  // it — separate from, and longer than, the 5-minute browse-to-checkout
  // lock (LOCK_TTL_MS in booking.service.js). Extends the same slot-lock
  // record atomically, so abandoned checkouts self-heal the same way an
  // abandoned slot hold already does — no scheduler needed.
  PAYMENT_RESERVATION_MINUTES: Number(process.env.PAYMENT_RESERVATION_MINUTES || 10),

  // Flat platform commission taken out of every ONLINE booking's amount, the
  // rest being owed to the turf's owner (see payment.service.js's commission
  // split, computed once at booking-confirmation time and never recomputed
  // later even if this value changes — so a rate change only affects bookings
  // confirmed after the change, never rewrites history). 0.10 = 10%.
  PLATFORM_COMMISSION_RATE: Number(process.env.PLATFORM_COMMISSION_RATE ?? 0.1),

  // ── Brevo (transactional email) ──
  BREVO_API_KEY: process.env.BREVO_API_KEY || "",
  BREVO_SENDER_EMAIL: process.env.BREVO_SENDER_EMAIL || "",
  BREVO_SENDER_NAME: process.env.BREVO_SENDER_NAME || "Turf Booking",
  BREVO_WEBHOOK_SECRET: process.env.BREVO_WEBHOOK_SECRET || "",

  // Public site URL used to build links inside emails (view booking, etc).
  FRONTEND_URL: process.env.FRONTEND_URL || "http://localhost:5173",

  // Platform support address shown in emails/failure screens.
  SUPPORT_EMAIL: process.env.SUPPORT_EMAIL || "",

  // How long before a slot starts a reminder email goes out. There is no
  // scheduler in this codebase by design (see ai-context.md); this value is
  // only consulted by the one endpoint that exists to be triggered by an
  // *external* scheduler (Vercel Cron, cron-job.org, etc) — see
  // notification.routes.js POST /jobs/send-reminders.
  BOOKING_REMINDER_HOURS_BEFORE: Number(process.env.BOOKING_REMINDER_HOURS_BEFORE || 3),
  // Shared secret the external scheduler must present (header
  // X-Cron-Secret, or Authorization: Bearer for Vercel Cron) to trigger the
  // reminder job over HTTP. Required in production.
  CRON_SECRET: process.env.CRON_SECRET || "",

  // How often the in-process reminder scheduler sweeps for bookings due a
  // reminder. Only used when running as a long-lived Node process (server.js)
  // — the serverless deployment drives the same job through vercel.json's
  // cron instead. Wants to be comfortably shorter than
  // BOOKING_REMINDER_HOURS_BEFORE so nothing slips past the window between
  // sweeps; re-running is free, since reminders dedupe.
  REMINDER_POLL_MINUTES: Number(process.env.REMINDER_POLL_MINUTES || 15),

  // ── Onboarding email OTP ──
  // Minutes an OTP stays valid after being issued (registerUser/resendOtp).
  OTP_EXPIRY_MINUTES: Number(process.env.OTP_EXPIRY_MINUTES || 10),
  // Testing-only backdoor: a fixed code that verifies ANY email's OTP,
  // instead of requiring the real emailed code. Only ever consulted when
  // NODE_ENV !== "production" (see auth.service.js verifyOtp) — that check is
  // hardcoded, not just gated by this var being unset, so setting this in a
  // production .env by mistake still can't open the backdoor there.
  OTP_MASTER_CODE: process.env.OTP_MASTER_CODE || "",
};

if (NODE_ENV === "production" && !env.CRON_SECRET) {
  logWarnNoCronSecret();
}
function logWarnNoCronSecret() {
  // Deferred require to avoid a circular import with logger.js (which
  // itself imports this file for LOG_LEVEL).
  console.warn(
    "[env] CRON_SECRET is not set — POST /api/notifications/jobs/send-reminders will refuse all requests until it is."
  );
}

// Payments are optional to configure (booking still works with CASH/manual
// owner bookings if unset) but must not be half-configured — a key with no
// secret, or vice versa, is always a mistake, not a valid state.
if (env.RAZORPAY_KEY_ID && !env.RAZORPAY_KEY_SECRET) {
  throw new Error("RAZORPAY_KEY_SECRET must be set whenever RAZORPAY_KEY_ID is.");
}
if (Number.isNaN(env.PLATFORM_COMMISSION_RATE) || env.PLATFORM_COMMISSION_RATE < 0 || env.PLATFORM_COMMISSION_RATE >= 1) {
  throw new Error("PLATFORM_COMMISSION_RATE must be a number between 0 (inclusive) and 1 (exclusive).");
}

export const isRazorpayConfigured = () => Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
export const isBrevoConfigured = () => Boolean(env.BREVO_API_KEY && env.BREVO_SENDER_EMAIL);
export const isImageKitConfigured = () =>
  Boolean(env.IMAGEKIT_PUBLIC_KEY && env.IMAGEKIT_PRIVATE_KEY && env.IMAGEKIT_URL_ENDPOINT);

export default env;

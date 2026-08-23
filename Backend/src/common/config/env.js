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
  // Max accepted image upload size in bytes (default 2 MB).
  MAX_IMAGE_BYTES: Number(process.env.MAX_IMAGE_BYTES || 2 * 1024 * 1024),

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
  // X-Cron-Secret) to trigger the reminder job. Required in production.
  CRON_SECRET: process.env.CRON_SECRET || "",
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
export const isRazorpayConfigured = () => Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
export const isBrevoConfigured = () => Boolean(env.BREVO_API_KEY && env.BREVO_SENDER_EMAIL);

export default env;

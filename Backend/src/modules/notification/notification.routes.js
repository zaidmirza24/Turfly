import { Router } from "express";
import NotificationLog from "./notificationLog.model.js";
import Booking from "../booking/booking.model.js";
import Slot from "../slot/slot.model.js";
import env from "../../common/config/env.js";
import logger from "../../common/utils/logger.js";
import safeEqual from "../../common/utils/safeEqual.js";
import * as emailService from "./email.service.js";

const router = Router();
const log = logger.child({ module: "notification.webhook" });

const STATUS_MAP = {
  sent: "SENT",
  delivered: "DELIVERED",
  opened: "DELIVERED", // opened implies delivered; keep the more informative of the two
  click: "DELIVERED",
  softBounce: "BOUNCED",
  hardBounce: "BOUNCED",
  blocked: "FAILED",
  invalid: "FAILED",
  deferred: "SENT",
  spam: "FAILED",
  unsubscribed: "DELIVERED",
  error: "FAILED",
};

/**
 * Phase 21. Brevo has no standard HMAC-style request signing for
 * transactional webhooks the way Razorpay does — the documented pattern is a
 * shared secret embedded in the webhook URL itself, configured when creating
 * the webhook in the Brevo dashboard (see .env.example / dashboard checklist
 * docs). BREVO_WEBHOOK_SECRET being unset simply means this endpoint is
 * disabled — it never falls back to accepting unauthenticated requests.
 *
 * Purely observational: updates NotificationLog delivery status. Must never
 * touch Payment/Booking state (Phase 21, explicit rule) — an email bouncing
 * says nothing about whether the underlying payment succeeded.
 */
router.post("/webhooks/brevo", async (req, res) => {
  if (!env.BREVO_WEBHOOK_SECRET || !safeEqual(req.query.token, env.BREVO_WEBHOOK_SECRET)) {
    return res.status(404).end();
  }

  const events = Array.isArray(req.body) ? req.body : [req.body];
  for (const evt of events) {
    const messageId = evt["message-id"] || evt.messageId;
    const mappedStatus = STATUS_MAP[evt.event];
    if (!messageId || !mappedStatus) continue;

    const update = { status: mappedStatus };
    if (mappedStatus === "DELIVERED") update.deliveredAt = new Date(evt.date || Date.now());

    await NotificationLog.updateOne({ providerMessageId: messageId }, { $set: update }).catch((err) =>
      log.error("Failed to record Brevo delivery event", { err, messageId, event: evt.event })
    );
  }

  res.status(200).json({ received: true });
});

/**
 * Phase 18 (booking reminders) — meant to be invoked by an external
 * scheduler (Vercel Cron, GitHub Actions, cron-job.org — anything that can
 * make an HTTP POST on a schedule), not by any traffic inside this app.
 * There is deliberately no in-process scheduler here (see ai-context.md:
 * "Recurring work without a scheduler"); a reminder is the one job in this
 * codebase that genuinely cannot be derived from a request path the way
 * lock-expiry is, so unlike everything else, it needs an outside trigger.
 *
 * Idempotent via the same NotificationLog dedupe mechanism as every other
 * email — safe to invoke this endpoint more often than needed (e.g. hourly)
 * without ever double-sending a reminder for the same booking.
 */
/**
 * Two accepted shapes, because the schedulers that can call this don't agree
 * on one:
 *
 *  - `X-Cron-Secret: <secret>` — any generic scheduler (cron-job.org, GitHub
 *    Actions, a server crontab) that can set an arbitrary header.
 *  - `Authorization: Bearer <secret>` — Vercel Cron, which sends a plain GET
 *    and cannot set custom headers; it attaches CRON_SECRET this way itself.
 *
 * Supporting only the first is why the reminder job had never actually run:
 * the natural way to schedule it on this deployment is a Vercel cron, and a
 * Vercel cron hitting this route would have been rejected as unauthenticated
 * every time — silently, since it 404s rather than erroring.
 */
const isAuthorizedCron = (req) => {
  if (!env.CRON_SECRET) return false;
  if (safeEqual(req.headers["x-cron-secret"], env.CRON_SECRET)) return true;
  const auth = req.headers.authorization;
  if (typeof auth === "string" && auth.startsWith("Bearer ")) {
    return safeEqual(auth.slice(7), env.CRON_SECRET);
  }
  return false;
};

const sendReminders = async (req, res) => {
  if (!isAuthorizedCron(req)) {
    return res.status(404).end();
  }

  const windowStart = new Date();
  const windowEnd = new Date(Date.now() + env.BOOKING_REMINDER_HOURS_BEFORE * 60 * 60 * 1000);

  const upcomingSlots = await Slot.find({
    status: "BOOKED",
    startTime: { $gt: windowStart, $lte: windowEnd },
  }).select("_id bookingId");

  const bookingIds = upcomingSlots.map((s) => s.bookingId).filter(Boolean);
  const bookings = await Booking.find({ _id: { $in: bookingIds }, status: "CONFIRMED" });

  let sent = 0;
  for (const booking of bookings) {
    const row = await emailService.sendBookingReminder(booking);
    if (row?.status === "SENT") sent += 1;
  }

  log.info("Booking reminder job ran", { candidates: bookings.length, sent });
  res.status(200).json({ candidates: bookings.length, sent });
};

// GET for Vercel Cron (which only issues GETs), POST for everything else.
// The job is idempotent — NotificationLog dedupes — so a GET having a side
// effect here is safe against retries and double-delivery, which is the
// property that usually makes it a bad idea.
router.get("/jobs/send-reminders", sendReminders);
router.post("/jobs/send-reminders", sendReminders);

export default router;

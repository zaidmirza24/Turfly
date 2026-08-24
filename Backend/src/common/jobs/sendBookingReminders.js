import Booking from "../../modules/booking/booking.model.js";
import NotificationLog from "../../modules/notification/notificationLog.model.js";
import * as emailService from "../../modules/notification/email.service.js";
import env from "../config/env.js";
import logger from "../utils/logger.js";

const log = logger.child({ module: "jobs.bookingReminders" });

/**
 * Emails a reminder for every CONFIRMED booking starting within the next
 * BOOKING_REMINDER_HOURS_BEFORE hours.
 *
 * This is the one recurring chore in this codebase that genuinely cannot be
 * derived from a request path. Slot locks self-heal because the act of reading
 * a schedule corrects it; a booking's completion settles when someone reads a
 * booking list. But "tell the customer three hours before they play" has no
 * corresponding read — nobody is looking at anything at that moment. Something
 * has to run on a clock.
 *
 * Safe to call as often as you like. `sendOnce` in email.service.js dedupes on
 * NotificationLog, so re-running this — on a shorter interval, from two server
 * instances at once, or from both the timer and the HTTP endpoint — never
 * double-sends a reminder for the same booking.
 */
export const sendBookingReminders = async () => {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + env.BOOKING_REMINDER_HOURS_BEFORE * 60 * 60 * 1000);

  // Queried straight off the booking's own slotStartTime rather than by
  // finding BOOKED slots and joining back — the denormalised copy exists
  // precisely so play time is directly queryable, and it saves a round trip.
  const candidates = await Booking.find({
    status: "CONFIRMED",
    slotStartTime: { $gt: now, $lte: windowEnd },
  });

  // Drop the ones already reminded, before attempting to send.
  //
  // `sendOnce` would dedupe these anyway, but it can't say so: on a duplicate
  // it returns the *existing* log row, which already reads SENT, so counting
  // its result reports every previously-reminded booking as freshly sent. That
  // made the sweep log claim work it hadn't done.
  //
  // Filtering here also removes real repeated work. A booking sits inside the
  // reminder window for the whole BOOKING_REMINDER_HOURS_BEFORE span, so at a
  // 15-minute poll it would otherwise be looked up, templated and handed to
  // sendOnce a dozen times before its slot arrives.
  const alreadySent = await NotificationLog.find({
    type: "BOOKING_REMINDER",
    bookingId: { $in: candidates.map((b) => b._id) },
    status: { $in: ["SENT", "DELIVERED"] },
  }).select("bookingId").lean();
  const remindedIds = new Set(alreadySent.map((row) => String(row.bookingId)));

  const bookings = candidates.filter((b) => !remindedIds.has(String(b._id)));

  let sent = 0;
  for (const booking of bookings) {
    // One failure must not abandon the rest of the batch — a single bad
    // recipient address would otherwise silently cost everyone else their
    // reminder.
    try {
      const row = await emailService.sendBookingReminder(booking);
      if (row?.status === "SENT") sent += 1;
    } catch (err) {
      log.error("Failed to send one booking reminder", { err, bookingId: booking._id });
    }
  }

  // `candidates` is everything due a reminder in this window; `pending` is
  // what hadn't already been reminded; `sent` is what actually went out now.
  return { candidates: candidates.length, pending: bookings.length, sent };
};

/**
 * Runs `sendBookingReminders` on an interval, for deployments that are a
 * long-lived Node process.
 *
 * Deliberately started only from server.js, never from app.js. On Vercel the
 * app is a serverless handler: the process is frozen between requests and
 * discarded, so a timer registered there would fire unpredictably or not at
 * all, while looking perfectly correct in code. That deployment uses the cron
 * in vercel.json to call the HTTP endpoint instead.
 */
export const startBookingReminderScheduler = () => {
  const intervalMs = env.REMINDER_POLL_MINUTES * 60 * 1000;

  // A run that outlives its interval must not stack on top of the next one.
  // Each overlapping run would re-query the same window and re-attempt the
  // same sends — harmless thanks to the NotificationLog dedupe, but it turns
  // a slow mail provider into unbounded concurrent work.
  let running = false;

  const tick = async () => {
    if (running) {
      log.warn("Previous reminder run still in progress — skipping this tick");
      return;
    }
    running = true;
    try {
      const result = await sendBookingReminders();
      // Only worth a line when it actually sent something; otherwise this
      // would print every few minutes forever and bury real entries.
      if (result.sent > 0) {
        log.info("Booking reminder sweep", result);
      }
    } catch (err) {
      // Never rethrow: an unhandled rejection here would take the process down
      // (see server.js's uncaughtException handler) over a background chore.
      log.error("Booking reminder sweep failed", { err });
    } finally {
      running = false;
    }
  };

  // A short delay rather than firing immediately, so a boot-time failure
  // (DB still connecting, mail client not configured) doesn't happen in the
  // same instant as everything else starting up.
  const initial = setTimeout(tick, 30_000);
  const interval = setInterval(tick, intervalMs);

  // Neither timer should hold the event loop open — the HTTP server is what
  // keeps the process alive, and these must not delay a shutdown.
  initial.unref();
  interval.unref();

  log.info("Booking reminder scheduler started", {
    everyMinutes: env.REMINDER_POLL_MINUTES,
    remindHoursBefore: env.BOOKING_REMINDER_HOURS_BEFORE,
  });

  return () => {
    clearTimeout(initial);
    clearInterval(interval);
    log.info("Booking reminder scheduler stopped");
  };
};

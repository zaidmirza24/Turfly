import env from "./common/config/env.js";
import connectDB from "./common/config/db.js";
import app from "./app.js";
import logger from "./common/utils/logger.js";
import { startBookingReminderScheduler } from "./common/jobs/sendBookingReminders.js";

/**
 * Local/traditional (long-running process) entry point.
 * Not used on Vercel — see api/index.js for the serverless entry point, which
 * reuses the same app.js but skips app.listen().
 *
 * Almost every recurring chore here needs no scheduler: expired slot locks
 * self-heal on read (common/jobs/releaseExpiredLocks.js), finished bookings
 * settle when a booking list is read (booking.service.js
 * settleFinishedBookings), and abandoned image uploads carry their own MongoDB
 * TTL expiry (modules/image/image.model.js).
 *
 * Booking reminders are the exception — "message the customer three hours
 * before they play" has no corresponding read to hang off, so it needs a
 * clock. This entry point starts an in-process timer for it. The serverless
 * entry point deliberately does NOT: that process is frozen between requests,
 * so a timer registered there would look correct and fire unpredictably or
 * never. Serverless drives the same job through vercel.json's cron instead.
 */

/**
 * Last-resort handlers.
 *
 * A rejected promise outside a request (a background job, a driver callback)
 * has no error middleware to reach. Without these, Node prints its own trace
 * and — for an unhandled rejection on Node 15+ — exits, leaving no structured
 * record of why the process died.
 */
process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled promise rejection", { err: reason });
});

process.on("uncaughtException", (err) => {
  // The process is in an undefined state after this, so the only safe move is
  // to record it and let the supervisor restart us.
  logger.error("Uncaught exception — shutting down", { err });
  process.exit(1);
});

const start = async () => {
  try {
    await connectDB();

    const server = app.listen(env.PORT, () => {
      logger.info("Server listening", { port: env.PORT, env: env.NODE_ENV });
    });

    // Started only after the DB connection is up, so the first sweep has
    // something to query.
    const stopReminderScheduler = startBookingReminderScheduler();

    // Stop accepting new connections and let in-flight requests finish, rather
    // than dropping them mid-response when the platform sends SIGTERM.
    const shutdown = (signal) => {
      logger.info("Shutting down", { signal });
      stopReminderScheduler();
      server.close(() => process.exit(0));
      // Don't hang forever on a stuck keep-alive connection.
      setTimeout(() => process.exit(1), 10_000).unref();
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  } catch (error) {
    logger.error("Failed to start server", { err: error });
    process.exit(1);
  }
};

start();

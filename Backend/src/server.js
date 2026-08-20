import env from "./common/config/env.js";
import connectDB from "./common/config/db.js";
import app from "./app.js";
import { initSlotCleanupJob } from "./common/jobs/slotCleanup.js";

/**
 * Local/traditional (long-running process) entry point.
 * Not used on Vercel — see api/index.js for the serverless entry point,
 * which reuses the same app.js but skips app.listen() and node-cron
 * (neither works in a serverless function).
 */
const start = async () => {
  try {
    await connectDB();

    // Background jobs only make sense with a persistent process.
    initSlotCleanupJob();

    app.listen(env.PORT, () => {
      console.log(`🚀 Server running on port ${env.PORT} [${env.NODE_ENV}]`);
    });
  } catch (error) {
    console.error(`❌ Failed to start server: ${error.message}`);
    process.exit(1);
  }
};

start();

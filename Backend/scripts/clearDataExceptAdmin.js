import mongoose from "mongoose";
import connectDB from "../src/common/config/db.js";
import env from "../src/common/config/env.js";
import User from "../src/modules/user/user.model.js";
import Turf from "../src/modules/turf/turf.model.js";
import Slot from "../src/modules/slot/slot.model.js";
import Booking from "../src/modules/booking/booking.model.js";
import Payment from "../src/modules/payment/payment.model.js";
import WebhookEvent from "../src/modules/payment/webhookEvent.model.js";
import Payout from "../src/modules/payout/payout.model.js";
import Review from "../src/modules/review/review.model.js";
import Image from "../src/modules/image/image.model.js";
import NotificationLog from "../src/modules/notification/notificationLog.model.js";
import AuditLog from "../src/modules/admin/auditLog.model.js";
import RateLimitBucket from "../src/common/models/rateLimitBucket.model.js";

/**
 * One-off reset: wipes every collection except ADMIN-role User documents.
 * Deliberately has NO production guard (unlike scripts/seedTestData.js) —
 * its whole purpose is to be pointed at whatever MONGO_URI is configured,
 * including production, on purpose.
 *
 * Defaults to a dry run (counts only, no writes). Requires
 * --yes-clear-prod-except-admin to actually delete anything — a long,
 * specific flag that can't be fat-fingered from habit the way -y or --force
 * could.
 *
 *   node scripts/clearDataExceptAdmin.js                          # dry run
 *   node scripts/clearDataExceptAdmin.js --yes-clear-prod-except-admin
 */
const CONFIRM_FLAG = "--yes-clear-prod-except-admin";

const NON_USER_MODELS = [
  ["Turf", Turf],
  ["Slot", Slot],
  ["Booking", Booking],
  ["Payment", Payment],
  ["WebhookEvent", WebhookEvent],
  ["Payout", Payout],
  ["Review", Review],
  ["Image", Image],
  ["NotificationLog", NotificationLog],
  ["AuditLog", AuditLog],
  ["RateLimitBucket", RateLimitBucket],
];

const run = async () => {
  const isRealRun = process.argv.includes(CONFIRM_FLAG);
  const maskedUri = env.MONGO_URI.replace(/\/\/[^@]*@/, "//<credentials>@");

  await connectDB();

  const adminUsers = await User.find({ role: "ADMIN" }).select("name email").lean();
  const nonAdminUserCount = await User.countDocuments({ role: { $ne: "ADMIN" } });

  console.log(`\nTarget database: ${maskedUri}`);
  console.log(`Mode: ${isRealRun ? "LIVE — WILL DELETE" : "DRY RUN — no changes will be made"}\n`);

  console.log(`Admin users to KEEP (${adminUsers.length}):`);
  for (const a of adminUsers) console.log(`  - ${a.name} <${a.email}>`);
  if (adminUsers.length === 0) {
    console.log("  (none found — double check this is the right database before proceeding)");
  }

  console.log(`\nNon-admin users to delete: ${nonAdminUserCount}`);

  const counts = [];
  for (const [label, Model] of NON_USER_MODELS) {
    counts.push([label, await Model.countDocuments()]);
  }
  console.log("\nOther collections to fully clear:");
  for (const [label, count] of counts) {
    console.log(`  ${label.padEnd(16)} ${count}`);
  }

  if (!isRealRun) {
    console.log(`\nDry run only. Re-run with ${CONFIRM_FLAG} to actually delete the above.`);
    await mongoose.disconnect();
    process.exit(0);
  }

  console.log("\nDeleting...");
  await User.deleteMany({ role: { $ne: "ADMIN" } });
  for (const [label, Model] of NON_USER_MODELS) {
    await Model.deleteMany({});
    console.log(`  cleared ${label}`);
  }

  console.log("\nDone. Remaining users:");
  const remaining = await User.find({}).select("name email role").lean();
  for (const u of remaining) console.log(`  - ${u.name} <${u.email}> (${u.role})`);

  await mongoose.disconnect();
  process.exit(0);
};

run().catch(async (err) => {
  console.error("clearDataExceptAdmin failed:", err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});

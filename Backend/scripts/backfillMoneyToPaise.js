import mongoose from "mongoose";
import connectDB from "../src/common/config/db.js";
import logger from "../src/common/utils/logger.js";

/**
 * One-off backfill for the rupee-float → integer-paise money migration.
 *
 * Renames each collection's rupee-valued field(s) to their `*Paise`
 * equivalent, multiplying by 100 and rounding to the nearest integer. Must be
 * run BEFORE deploying the backend code that expects the renamed `*Paise`
 * schema fields (see the money migration plan) — this script talks to the
 * raw collections, not the Mongoose models, since by the time this runs the
 * models on disk already expect the new field names.
 *
 * Idempotent: only touches documents where the old field still exists and
 * the new `*Paise` field doesn't yet, so re-running after a partial failure
 * (or re-running harmlessly after a full success) is always safe.
 *
 *   node scripts/backfillMoneyToPaise.js [--dry-run] [--rollback]
 */
const FIELD_MAP = {
  payments: ["amount"],
  bookings: ["amount", "refundAmount", "commissionAmount", "ownerAmount"],
  payouts: ["amount"],
  slots: ["price", "lockedPrice"],
  // Mongoose's default pluralizer names the Turf collection "turves" (its
  // generic word-ending-in-f rule), not "turfs" — verified against the
  // actual database via `mongoose.connection.db.listCollections()`.
  turves: ["pricePerHour", "defaultWeekdayPrice", "defaultWeekendPrice"],
};

const isDryRun = process.argv.includes("--dry-run");
const isRollback = process.argv.includes("--rollback");

const migrateTopLevelField = async (collection, field, { dryRun, rollback }) => {
  const paiseField = `${field}Paise`;
  const filter = rollback
    ? { [paiseField]: { $exists: true } }
    : { [field]: { $exists: true, $ne: null }, [paiseField]: { $exists: false } };

  const docs = await collection.find(filter).toArray();
  let migrated = 0;
  let skipped = 0;
  let errors = 0;

  for (const doc of docs) {
    try {
      if (rollback) {
        const rupees = Math.round(doc[paiseField]) / 100;
        if (!dryRun) {
          await collection.updateOne({ _id: doc._id }, { $set: { [field]: rupees }, $unset: { [paiseField]: "" } });
        }
      } else {
        if (typeof doc[field] !== "number" || Number.isNaN(doc[field])) {
          logger.error("Non-numeric money field — skipped", { collection: collection.collectionName, id: String(doc._id), field, value: doc[field] });
          skipped += 1;
          continue;
        }
        const paise = Math.round(doc[field] * 100);
        if (!dryRun) {
          await collection.updateOne({ _id: doc._id }, { $set: { [paiseField]: paise }, $unset: { [field]: "" } });
        }
      }
      migrated += 1;
    } catch (err) {
      errors += 1;
      logger.error("Money field migration failed for one document", { collection: collection.collectionName, id: String(doc._id), field, err });
    }
  }

  return { field, matched: docs.length, migrated, skipped, errors };
};

// Refunds is an array of subdocuments on Payment, each needing its own
// computed paise value — can't be done as a single atomic update expression
// across all elements, so this reads and rewrites the whole array per doc.
const migratePaymentRefunds = async (collection, { dryRun, rollback }) => {
  const filter = rollback
    ? { "refunds.amountPaise": { $exists: true } }
    : { "refunds.amount": { $exists: true } };

  const docs = await collection.find(filter).toArray();
  let migrated = 0;
  let errors = 0;

  for (const doc of docs) {
    try {
      const refunds = (doc.refunds || []).map((r) => {
        if (rollback) {
          if (r.amountPaise === undefined) return r;
          const { amountPaise, ...rest } = r;
          return { ...rest, amount: Math.round(amountPaise) / 100 };
        }
        if (r.amount === undefined) return r;
        const { amount, ...rest } = r;
        return { ...rest, amountPaise: Math.round(amount * 100) };
      });
      if (!dryRun) {
        await collection.updateOne({ _id: doc._id }, { $set: { refunds } });
      }
      migrated += 1;
    } catch (err) {
      errors += 1;
      logger.error("Payment refunds migration failed for one document", { id: String(doc._id), err });
    }
  }

  return { field: "refunds[].amount", matched: docs.length, migrated, skipped: 0, errors };
};

const run = async () => {
  await connectDB();

  logger.info("Money-to-paise backfill starting", { dryRun: isDryRun, rollback: isRollback });

  const summary = [];
  let totalErrors = 0;

  for (const [collectionName, fields] of Object.entries(FIELD_MAP)) {
    const collection = mongoose.connection.collection(collectionName);
    for (const field of fields) {
      const result = await migrateTopLevelField(collection, field, { dryRun: isDryRun, rollback: isRollback });
      summary.push({ collection: collectionName, ...result });
      totalErrors += result.errors;
    }
  }

  const paymentsCollection = mongoose.connection.collection("payments");
  const refundsResult = await migratePaymentRefunds(paymentsCollection, { dryRun: isDryRun, rollback: isRollback });
  summary.push({ collection: "payments", ...refundsResult });
  totalErrors += refundsResult.errors;

  logger.info("Money-to-paise backfill summary", { summary });

  if (!isDryRun && !isRollback) {
    // Verification pass: confirm nothing was left half-migrated.
    let remaining = 0;
    for (const [collectionName, fields] of Object.entries(FIELD_MAP)) {
      const collection = mongoose.connection.collection(collectionName);
      for (const field of fields) {
        const count = await collection.countDocuments({ [field]: { $exists: true } });
        if (count > 0) {
          logger.error("Documents still have the old rupee field after migration", { collection: collectionName, field, count });
          remaining += count;
        }
      }
    }
    const remainingRefunds = await paymentsCollection.countDocuments({ "refunds.amount": { $exists: true } });
    if (remainingRefunds > 0) {
      logger.error("Payment refunds still have the old rupee field after migration", { count: remainingRefunds });
      remaining += remainingRefunds;
    }
    if (remaining > 0) {
      logger.error("Backfill verification failed — old fields remain", { remaining });
      totalErrors += remaining;
    } else {
      logger.info("Backfill verification passed — no old rupee fields remain");
    }
  }

  await mongoose.disconnect();
  process.exit(totalErrors > 0 ? 1 : 0);
};

run().catch(async (error) => {
  logger.error("Money-to-paise backfill script failed", { err: error });
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});

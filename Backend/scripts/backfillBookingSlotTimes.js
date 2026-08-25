// Backfills Booking.slotStartTime / slotEndTime from each booking's slot.
//
// Those two fields are a queryable copy of when a booking is actually played.
// They were added because every operational view — the owner's date filter,
// the admin booking list, the dashboard's "today" figures, review eligibility
// — needs to filter and sort on play time, which previously lived only on the
// referenced Slot document and so wasn't reachable from a Mongo query. Before
// they existed, those views fell back to `createdAt` and answered "when was
// this booked" instead.
//
// Any Booking written before that change has neither field. Left alone it
// sorts last, falls outside every date range, and never counts toward a
// dashboard total — it doesn't error, it just quietly stops existing as far
// as those screens are concerned. This copies the values across.
//
// Idempotent: only touches documents that are actually missing the fields, so
// it's safe to re-run.
//
//   Dry run (default, writes nothing):  node scripts/backfillBookingSlotTimes.js
//   Actually backfill:                  node scripts/backfillBookingSlotTimes.js --apply
import "dotenv/config";
import mongoose from "mongoose";
import Booking from "../src/modules/booking/booking.model.js";
import Slot from "../src/modules/slot/slot.model.js";

const APPLY = process.argv.includes("--apply");

async function main() {
  await mongoose.connect(process.env.MONGO_URI);

  if (!APPLY) console.log("DRY RUN — nothing will be written. Re-run with --apply.\n");

  // `.lean()` and a raw filter rather than the model's own query helpers: the
  // schema now marks these fields required, and we're specifically looking for
  // the documents that violate that.
  const stale = await Booking.find({
    $or: [{ slotStartTime: { $exists: false } }, { slotStartTime: null }],
  })
    .select("_id slotId")
    .lean();

  console.log(`${stale.length} booking(s) missing slot times`);
  if (stale.length === 0) {
    await mongoose.disconnect();
    return;
  }

  const slots = await Slot.find({ _id: { $in: stale.map((b) => b.slotId) } })
    .select("_id startTime endTime")
    .lean();
  const slotById = new Map(slots.map((s) => [String(s._id), s]));

  let updated = 0;
  const orphans = [];

  for (const booking of stale) {
    const slot = slotById.get(String(booking.slotId));
    if (!slot) {
      // The slot was deleted out from under the booking. Nothing here can
      // recover the play time, so it's reported rather than guessed at.
      orphans.push(String(booking._id));
      continue;
    }
    if (APPLY) {
      await Booking.updateOne(
        { _id: booking._id },
        { $set: { slotStartTime: slot.startTime, slotEndTime: slot.endTime } }
      );
    }
    updated += 1;
  }

  console.log(APPLY ? `Backfilled ${updated} booking(s)` : `Would backfill ${updated} booking(s)`);

  if (orphans.length > 0) {
    console.log(`\n⚠️  ${orphans.length} booking(s) reference a slot that no longer exists:`);
    orphans.forEach((id) => console.log(`   ${id}`));
    console.log("These can't be backfilled automatically — their play time is unrecoverable.");
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

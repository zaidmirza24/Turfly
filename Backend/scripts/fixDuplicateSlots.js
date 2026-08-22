// One-time repair for the slots collection:
//  1. Dedupe documents that share (turfId, startTime) — a real bug because
//     the compound index on that pair was never actually unique on this
//     database (see the index listing this script checks below), so nothing
//     ever stopped duplicates from being created under concurrent requests.
//  2. Rebuild the index as unique so this can't recur.
//
// Run with: node scripts/fixDuplicateSlots.js
import "dotenv/config";
import mongoose from "mongoose";
import Slot from "../src/modules/slot/slot.model.js";

const statusRank = { BOOKED: 0, LOCKED: 1, FULL: 2, CLOSED: 3, AVAILABLE: 4 };

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const coll = mongoose.connection.db.collection("slots");

  const groups = await coll
    .aggregate([
      { $group: { _id: { turfId: "$turfId", startTime: "$startTime" }, ids: { $push: "$_id" }, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
    ])
    .toArray();

  console.log(`Found ${groups.length} duplicated (turfId, startTime) pairs`);

  let deleted = 0;
  for (const g of groups) {
    const docs = await Slot.find({ _id: { $in: g.ids } }).lean();
    // Keep whichever doc represents the most "real" state (an actual booking
    // or hold beats a plain AVAILABLE placeholder), tie-broken by whichever
    // was created first.
    const [keep, ...rest] = [...docs].sort((a, b) => {
      const rankDiff = (statusRank[a.status] ?? 9) - (statusRank[b.status] ?? 9);
      if (rankDiff !== 0) return rankDiff;
      return a._id.getTimestamp() - b._id.getTimestamp();
    });
    const toDelete = rest.map((d) => d._id);
    await Slot.deleteMany({ _id: { $in: toDelete } });
    deleted += toDelete.length;
  }
  console.log(`Deleted ${deleted} duplicate slot documents (kept 1 per pair)`);

  // Rebuild the compound index as unique. dropIndex first since Mongoose
  // won't touch an existing index whose options changed on its own.
  try {
    await coll.dropIndex("turfId_1_startTime_1");
    console.log("Dropped old non-unique turfId_1_startTime_1 index");
  } catch (err) {
    console.log("No existing index to drop (or already gone):", err.message);
  }
  await Slot.syncIndexes();
  const indexes = await coll.indexes();
  console.log("Indexes after repair:", JSON.stringify(indexes, null, 2));

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

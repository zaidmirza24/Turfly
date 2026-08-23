import connectDB from "../src/common/config/db.js";
import env from "../src/common/config/env.js";
import mongoose from "mongoose";
import User from "../src/modules/user/user.model.js";
import Turf from "../src/modules/turf/turf.model.js";
import Slot from "../src/modules/slot/slot.model.js";
import Booking from "../src/modules/booking/booking.model.js";
import { toPaise } from "../src/common/utils/money.js";

const hoursFromMidnight = (date, hour) => {
  const d = new Date(date);
  d.setHours(hour, 0, 0, 0);
  return d;
};

const run = async () => {
  // This script deletes every user, turf, slot and booking before seeding.
  // It reads MONGO_URI from the same .env the server uses, so running it with
  // production credentials loaded — a one-line mistake — wipes the live
  // database with no confirmation and no backup. Two guards: never in
  // production, and require an explicit opt-in flag.
  if (env.NODE_ENV === "production") {
    console.error("Refusing to run: seed:test wipes all data and NODE_ENV is 'production'.");
    process.exit(1);
  }
  if (!process.argv.includes("--yes-wipe-all-data")) {
    console.error(
      "This deletes ALL users, turfs, slots and bookings in " +
        env.MONGO_URI.replace(/\/\/[^@]*@/, "//<credentials>@") +
        "\nRe-run with --yes-wipe-all-data if that is what you want."
    );
    process.exit(1);
  }

  await connectDB();

  console.log("Clearing existing data...");
  await Promise.all([
    User.deleteMany({}),
    Turf.deleteMany({}),
    Slot.deleteMany({}),
    Booking.deleteMany({}),
  ]);

  console.log("Creating users...");
  const admin = await User.create({
    name: "Platform Admin",
    email: "admin@turf.local",
    password: "changeme123",
    role: "ADMIN",
  });

  const ownerA = await User.create({
    name: "Ravi Shankar",
    email: "ravi@turfowner.com",
    phone: "9876500001",
    password: "password123",
    role: "OWNER",
  });

  const ownerB = await User.create({
    name: "Priya Nair",
    email: "priya@turfowner.com",
    phone: "9876500002",
    password: "password123",
    role: "OWNER",
  });

  const playerA = await User.create({
    name: "Aisha Khan",
    email: "aisha@player.com",
    phone: "9876500003",
    password: "password123",
    role: "USER",
  });

  const playerB = await User.create({
    name: "Karan Mehta",
    email: "karan@player.com",
    phone: "9876500004",
    password: "password123",
    role: "USER",
  });

  console.log("Creating turfs...");
  const greenArena = await Turf.create({
    ownerId: ownerA._id,
    name: "Green Arena",
    location: "Koramangala, Bangalore",
    sportsType: ["football"],
    amenities: ["Floodlights", "Changing Rooms", "Parking"],
    pricePerHourPaise: toPaise(1000),
    isActive: true,
    approvalStatus: "APPROVED",
  });

  const rooftopBadminton = await Turf.create({
    ownerId: ownerA._id,
    name: "Rooftop Badminton Court",
    location: "Indiranagar, Bangalore",
    sportsType: ["badminton"],
    amenities: ["Air Conditioning", "Equipment Rental"],
    pricePerHourPaise: toPaise(600),
    isActive: true,
    approvalStatus: "PENDING", // test admin approve/reject flow
  });

  const boundaryNets = await Turf.create({
    ownerId: ownerB._id,
    name: "Boundary Nets",
    location: "HSR Layout, Bangalore",
    sportsType: ["cricket"],
    amenities: ["Floodlights", "Parking", "Drinking Water"],
    pricePerHourPaise: toPaise(1400),
    isActive: true,
    approvalStatus: "APPROVED",
  });

  const aceTennis = await Turf.create({
    ownerId: ownerB._id,
    name: "Ace Tennis Club",
    location: "Whitefield, Bangalore",
    sportsType: ["tennis"],
    amenities: ["Coaching", "Pro Shop"],
    pricePerHourPaise: toPaise(900),
    isActive: true,
    approvalStatus: "REJECTED", // test rejected-state display
  });

  console.log("Creating slots...");
  const today = new Date();
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const hours = [6, 7, 8, 9, 17, 18, 19, 20];

  const makeSlots = (turf, date) =>
    hours.map((h) => ({
      turfId: turf._id,
      startTime: hoursFromMidnight(date, h),
      endTime: hoursFromMidnight(date, h + 1),
      pricePaise: turf.pricePerHourPaise,
      status: "AVAILABLE",
    }));

  const greenArenaTodaySlots = await Slot.insertMany(makeSlots(greenArena, today));
  await Slot.insertMany(makeSlots(greenArena, tomorrow));
  const boundaryNetsTodaySlots = await Slot.insertMany(makeSlots(boundaryNets, today));
  await Slot.insertMany(makeSlots(boundaryNets, tomorrow));
  await Slot.insertMany(makeSlots(rooftopBadminton, today));

  // A past slot + cancelled booking, so the "History" tab has something in it
  const [pastSlot] = await Slot.insertMany(makeSlots(greenArena, yesterday).slice(0, 1));

  console.log("Creating bookings...");

  // Aisha books an upcoming Green Arena slot — CONFIRMED
  const slot1 = greenArenaTodaySlots[4]; // 17:00 today
  await Slot.findByIdAndUpdate(slot1._id, { status: "BOOKED" });
  const booking1 = await Booking.create({
    userId: playerA._id,
    turfId: greenArena._id,
    slotId: slot1._id,
    status: "CONFIRMED",
    amountPaise: greenArena.pricePerHourPaise,
  });
  await Slot.findByIdAndUpdate(slot1._id, { bookingId: booking1._id });

  // Karan books an upcoming Boundary Nets slot — CONFIRMED
  const slot2 = boundaryNetsTodaySlots[5]; // 18:00 today
  await Slot.findByIdAndUpdate(slot2._id, { status: "BOOKED" });
  const booking2 = await Booking.create({
    userId: playerB._id,
    turfId: boundaryNets._id,
    slotId: slot2._id,
    status: "CONFIRMED",
    amountPaise: boundaryNets.pricePerHourPaise,
  });
  await Slot.findByIdAndUpdate(slot2._id, { bookingId: booking2._id });

  // Aisha had a booking yesterday that got cancelled — for the History tab
  await Booking.create({
    userId: playerA._id,
    turfId: greenArena._id,
    slotId: pastSlot._id,
    status: "CANCELLED",
    amountPaise: greenArena.pricePerHourPaise,
  });

  console.log("\nDone. Seeded:");
  console.log(`  Admin:   admin@turf.local / changeme123`);
  console.log(`  Owner:   ravi@turfowner.com / password123  (Green Arena [APPROVED], Rooftop Badminton [PENDING])`);
  console.log(`  Owner:   priya@turfowner.com / password123 (Boundary Nets [APPROVED], Ace Tennis [REJECTED])`);
  console.log(`  Player:  aisha@player.com / password123    (1 confirmed booking, 1 cancelled booking)`);
  console.log(`  Player:  karan@player.com / password123    (1 confirmed booking)`);

  await mongoose.disconnect();
  process.exit(0);
};

run().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});

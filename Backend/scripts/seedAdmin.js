import connectDB from "../src/common/config/db.js";
import env from "../src/common/config/env.js";
import User from "../src/modules/user/user.model.js";
import mongoose from "mongoose";

const run = async () => {
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) {
    console.error("❌ Set ADMIN_EMAIL and ADMIN_PASSWORD in Backend/.env before seeding.");
    process.exit(1);
  }

  await connectDB();

  const existing = await User.findOne({ email: env.ADMIN_EMAIL });
  if (existing) {
    console.log(`ℹ️ Admin user ${env.ADMIN_EMAIL} already exists — nothing to do.`);
  } else {
    await User.create({
      name: env.ADMIN_NAME,
      email: env.ADMIN_EMAIL,
      password: env.ADMIN_PASSWORD,
      role: "ADMIN",
    });
    console.log(`✅ Admin user created: ${env.ADMIN_EMAIL}`);
  }

  await mongoose.disconnect();
  process.exit(0);
};

run();

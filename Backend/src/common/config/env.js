import dotenv from "dotenv";
dotenv.config();

const NODE_ENV = process.env.NODE_ENV || "development";

// A missing signing secret must never fall back to a shipped literal — that
// literal is public (it's in this file's git history), so a fallback would
// let anyone forge a token for any user, including ADMIN. Failing startup
// loudly in production is the only safe behavior; local/dev/test keep a
// fixed fallback purely for convenience, where the stakes of a guessable
// secret are nil.
if (NODE_ENV === "production" && !process.env.JWT_SECRET) {
  throw new Error(
    "JWT_SECRET must be set in production — refusing to start with a fallback signing secret."
  );
}

const env = {
  PORT: process.env.PORT || 5000,
  MONGO_URI: process.env.MONGO_URI || "mongodb://127.0.0.1:27017/turf_booking",
  JWT_SECRET: process.env.JWT_SECRET || "fallback_secret_change_me",
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "7d",
  NODE_ENV,
  ADMIN_EMAIL: process.env.ADMIN_EMAIL || "",
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || "",
  ADMIN_NAME: process.env.ADMIN_NAME || "Platform Admin",
  // Comma-separated list of allowed browser origins. Unset = allow any origin.
  CORS_ORIGINS: process.env.CORS_ORIGINS || "",
  // debug | info | warn | error | silent. Defaults to info in production,
  // debug elsewhere.
  LOG_LEVEL: process.env.LOG_LEVEL || "",
  // Max accepted image upload size in bytes (default 2 MB).
  MAX_IMAGE_BYTES: Number(process.env.MAX_IMAGE_BYTES || 2 * 1024 * 1024),
};

export default env;

import mongoose from "mongoose";
import env from "./env.js";
import logger from "../utils/logger.js";

/**
 * Cached across invocations so serverless platforms (Vercel) reuse the
 * connection instead of opening a new one on every request/cold start.
 * `global` survives across invocations on a warm lambda instance.
 */
let cached = global._mongooseConn;
if (!cached) {
  cached = global._mongooseConn = { conn: null, promise: null };
}

const connectDB = async () => {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(env.MONGO_URI, { bufferCommands: false })
      .then((mongooseInstance) => {
        logger.info("MongoDB connected", { host: mongooseInstance.connection.host });
        return mongooseInstance;
      });
  }

  try {
    cached.conn = await cached.promise;
  } catch (error) {
    // Reset the memoised promise so the next request retries the connection
    // instead of re-awaiting a rejected one for the life of the process.
    cached.promise = null;
    logger.error("MongoDB connection failed", { err: error });
    throw error;
  }

  return cached.conn;
};

export default connectDB;

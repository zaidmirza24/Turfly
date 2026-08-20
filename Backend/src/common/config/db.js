import mongoose from "mongoose";
import env from "./env.js";

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
        console.log(`✅ MongoDB connected: ${mongooseInstance.connection.host}`);
        return mongooseInstance;
      });
  }

  try {
    cached.conn = await cached.promise;
  } catch (error) {
    cached.promise = null;
    throw error;
  }

  return cached.conn;
};

export default connectDB;

import jwt from "jsonwebtoken";
import crypto from "crypto";
import User from "../user/user.model.js";
import ApiError from "../../common/utils/ApiError.js";
import env from "../../common/config/env.js";
import logger from "../../common/utils/logger.js";
import * as emailService from "../notification/email.service.js";

const log = logger.child({ module: "auth" });

/**
 * Generate JWT token for a user.
 */
const generateToken = (userId) => {
  return jwt.sign({ id: userId }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  });
};

// Roles the public registration endpoint may assign. ADMIN accounts are
// provisioned only via scripts/seedAdmin.js — never self-service, or any
// caller could hand themselves platform-admin access via this endpoint.
const PUBLIC_REGISTRATION_ROLES = ["USER", "OWNER"];

/**
 * Register a new user.
 */
export const registerUser = async ({ name, email, phone, password, role }) => {
  // Explicit checks before touching the DB. Without them a missing password
  // reaches Mongoose as `undefined` and surfaces as a schema ValidationError,
  // and a non-string email (`?email[$ne]=null` style payloads) reaches
  // User.findOne as a Mongo operator object rather than a value.
  if (typeof name !== "string" || name.trim().length === 0) {
    throw new ApiError(400, "Name is required");
  }
  if (typeof email !== "string" || !/^\S+@\S+\.\S+$/.test(email)) {
    throw new ApiError(400, "A valid email is required");
  }
  if (typeof password !== "string" || password.length < 6) {
    throw new ApiError(400, "Password must be at least 6 characters");
  }
  if (phone !== undefined && phone !== null && typeof phone !== "string") {
    throw new ApiError(400, "Phone must be a string");
  }

  const existingUser = await User.findOne({ email: email.toLowerCase() });
  if (existingUser) {
    throw new ApiError(409, "User with this email already exists");
  }

  const safeRole = PUBLIC_REGISTRATION_ROLES.includes(role) ? role : "USER";
  const user = await User.create({ name, email, phone, password, role: safeRole });
  const token = generateToken(user._id);

  return {
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      avatar: user.avatar,
    },
    token,
  };
};

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Step 1 of self-service password reset. Always resolves the same way
 * regardless of whether the email exists, was deleted, or is a guest — the
 * controller sends one generic "if that email exists..." response either
 * way, so this must never let its caller distinguish those cases (that's an
 * account-enumeration oracle otherwise). The actual work — generating and
 * storing a token, sending an email — only happens for a real, resettable
 * account; every other case is a silent no-op.
 */
export const requestPasswordReset = async (email) => {
  if (typeof email !== "string" || !email) return;

  const user = await User.findOne({ email: email.toLowerCase(), isDeleted: false, isGuest: false });
  if (!user) return;

  // The raw token is what goes in the email link; only its SHA-256 hash is
  // persisted, the same reasoning as never storing a plaintext password —
  // this document leaking must not hand out a working reset link.
  const rawToken = crypto.randomBytes(32).toString("hex");
  user.resetPasswordTokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  user.resetPasswordExpires = new Date(Date.now() + RESET_TOKEN_TTL_MS);
  await user.save();

  const resetUrl = `${env.FRONTEND_URL}/reset-password?token=${rawToken}&email=${encodeURIComponent(user.email)}`;
  await emailService.sendPasswordReset(user, resetUrl).catch((err) =>
    log.error("Failed to send password reset email", { err, userId: user._id })
  );
};

/**
 * Step 2 — spends the token. A used or expired token is refused with the
 * same generic error either way, so a caller probing tokens learns nothing
 * about which reason it failed for.
 */
export const resetPassword = async ({ email, token, newPassword }) => {
  if (typeof email !== "string" || typeof token !== "string" || !token) {
    throw new ApiError(400, "Invalid or expired reset link");
  }
  if (typeof newPassword !== "string" || newPassword.length < 6) {
    throw new ApiError(400, "Password must be at least 6 characters");
  }

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const user = await User.findOne({
    email: email.toLowerCase(),
    resetPasswordTokenHash: tokenHash,
    resetPasswordExpires: { $gt: new Date() },
  }).select("+resetPasswordTokenHash +resetPasswordExpires");

  if (!user) {
    throw new ApiError(400, "Invalid or expired reset link — request a new one");
  }

  user.password = newPassword; // re-hashed by the pre-save hook
  user.resetPasswordTokenHash = null;
  user.resetPasswordExpires = null;
  await user.save();

  log.info("Password reset completed", { userId: user._id });
};

/**
 * Login user with email & password.
 */
export const loginUser = async ({ email, password }) => {
  // Both must be strings before they reach the query: an object value here
  // (`{"email": {"$ne": null}}`) would otherwise be interpreted by Mongo as an
  // operator and match an arbitrary account.
  if (typeof email !== "string" || typeof password !== "string") {
    throw new ApiError(400, "Email and password are required");
  }

  const user = await User.findOne({ email: email.toLowerCase() }).select("+password");
  if (!user) {
    throw new ApiError(401, "Invalid email or password");
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    throw new ApiError(401, "Invalid email or password");
  }

  // Checked after the password match (not before) so a deleted account's
  // existence isn't distinguishable from a wrong-password response — the
  // same reasoning as the generic "Invalid email or password" message above.
  if (user.isDeleted) {
    throw new ApiError(401, "This account has been deleted");
  }
  if (user.isBanned) {
    throw new ApiError(403, "Account suspended");
  }

  const token = generateToken(user._id);

  return {
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      avatar: user.avatar,
    },
    token,
  };
};

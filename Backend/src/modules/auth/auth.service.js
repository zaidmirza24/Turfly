import jwt from "jsonwebtoken";
import User from "../user/user.model.js";
import ApiError from "../../common/utils/ApiError.js";
import env from "../../common/config/env.js";

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

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
  const existingUser = await User.findOne({ email });
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
    },
    token,
  };
};

/**
 * Login user with email & password.
 */
export const loginUser = async ({ email, password }) => {
  const user = await User.findOne({ email }).select("+password");
  if (!user) {
    throw new ApiError(401, "Invalid email or password");
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    throw new ApiError(401, "Invalid email or password");
  }

  const token = generateToken(user._id);

  return {
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
    },
    token,
  };
};

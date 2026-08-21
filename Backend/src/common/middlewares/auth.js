import jwt from "jsonwebtoken";
import env from "../config/env.js";
import ApiError from "../utils/ApiError.js";
import { addContext } from "../utils/logger.js";
import User from "../../modules/user/user.model.js";

/**
 * Protect routes — verifies JWT and attaches user to req.
 */
export const protect = async (req, _res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    throw new ApiError(401, "Not authorized — no token provided");
  }

  const decoded = jwt.verify(token, env.JWT_SECRET);
  const user = await User.findById(decoded.id).select("-password");

  if (!user) {
    throw new ApiError(401, "Not authorized — user no longer exists");
  }

  if (user.isBanned) {
    throw new ApiError(403, "Account suspended");
  }

  if (user.isDeleted) {
    throw new ApiError(401, "This account has been deleted");
  }

  // Everything logged from here on carries who it was for. The id and role
  // only — never the email or name, which are the user's personal data and
  // have no business being replicated into a log store.
  addContext({ userId: user._id.toString(), role: user.role });

  req.user = user;
  next();
};

/**
 * Role-based access control.
 * Usage: authorize("OWNER") or authorize("USER", "OWNER")
 */
export const authorize = (...roles) => {
  return (req, _res, next) => {
    if (!roles.includes(req.user.role)) {
      throw new ApiError(
        403,
        `Role '${req.user.role}' is not authorized to access this route`
      );
    }
    next();
  };
};

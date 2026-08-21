import env from "../config/env.js";
import logger, { getRequestId } from "../utils/logger.js";

/**
 * Global error handler middleware.
 * Catches all thrown errors (including async via express-async-errors).
 *
 * This is the single place errors are turned into both a client response and a
 * log record, so every failure is reported the same way and nothing is
 * swallowed silently on the way out.
 */
const errorHandler = (err, req, res, _next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || "Internal Server Error";

  // Mongoose bad ObjectId
  if (err.name === "CastError") {
    statusCode = 400;
    message = "Invalid resource ID format";
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue).join(", ");
    message = `Duplicate value for field: ${field}`;
  }

  // Mongoose validation error
  if (err.name === "ValidationError") {
    statusCode = 400;
    const messages = Object.values(err.errors).map((val) => val.message);
    message = messages.join(". ");
  }

  // JWT errors
  if (err.name === "JsonWebTokenError") {
    statusCode = 401;
    message = "Invalid token";
  }

  if (err.name === "TokenExpiredError") {
    statusCode = 401;
    message = "Token expired";
  }

  // Multer (upload) errors arrive with their own codes; the default messages
  // ("File too large") are terse and mention no limit, so they're rewritten
  // into something a person can act on.
  if (err.name === "MulterError") {
    statusCode = 400;
    if (err.code === "LIMIT_FILE_SIZE") message = "That file is too large";
    else if (err.code === "LIMIT_FILE_COUNT") message = "Too many files in one upload";
    else if (err.code === "LIMIT_UNEXPECTED_FILE") message = "Unexpected file field";
    else message = "Upload failed";
  }

  // `req.requestId` is set by the requestContext middleware and survives
  // multipart streaming; the async store is the fallback for errors raised
  // before that middleware ran.
  const requestId = req.requestId || getRequestId();
  const isUnexpected = statusCode >= 500;

  // Expected failures (a 404, a rejected password) are normal traffic, not
  // incidents — they're logged at warn with no stack, so `level=error` stays a
  // list of things that are actually broken.
  const context = {
    err,
    statusCode,
    method: req.method,
    path: (req.originalUrl || req.url || "").split("?")[0],
    userId: req.user?._id,
  };

  if (isUnexpected) {
    logger.error("Unhandled error", context);
  } else {
    logger.warn("Request rejected", {
      ...context,
      // `type`, not `name`: `name` is redacted as personal data, which turned
      // every expected failure's error class into "[redacted]".
      err: { type: err.name, message: err.message },
    });
  }

  res.status(statusCode).json({
    success: false,
    // Anything that reached here as a 500 is an unexpected failure, and its
    // message is whatever the driver/runtime produced — connection strings,
    // internal field names, file paths. Clients get a generic message in
    // production; the real one still goes to the server log.
    message: isUnexpected && env.NODE_ENV === "production" ? "Internal Server Error" : message,
    // Returned so a user reporting a problem can quote an id that finds the
    // exact log lines for their request.
    ...(requestId ? { requestId } : {}),
    ...(env.NODE_ENV === "development" && { stack: err.stack }),
  });
};

export default errorHandler;

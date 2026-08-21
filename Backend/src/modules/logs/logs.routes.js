import { Router } from "express";
import ApiResponse from "../../common/utils/ApiResponse.js";
import ApiError from "../../common/utils/ApiError.js";
import logger from "../../common/utils/logger.js";
import { rateLimit } from "../../common/middlewares/rateLimit.js";

const router = Router();

/**
 * Client-side error ingestion.
 *
 * Without this, a crash in the browser is only visible in that one user's
 * devtools — nobody operating the platform ever learns it happened. Posting it
 * here puts frontend and backend failures into the same log stream, correlated
 * by the same request id, so one search covers both halves of a broken flow.
 *
 * Deliberately unauthenticated: the errors most worth seeing are the ones that
 * happen when auth itself is broken, or before the user has signed in. That
 * makes it a public write endpoint, so it is rate limited, size capped, and
 * every field is treated as untrusted input — nothing here is echoed back to
 * any user, and the logger redacts and truncates before anything is written.
 */
const clientLogLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 30,
  message: "Too many error reports",
});

const ALLOWED_LEVELS = new Set(["warn", "error"]);
const MAX_FIELD = 2000;

const asString = (value, max = MAX_FIELD) =>
  typeof value === "string" && value.length > 0 ? value.slice(0, max) : undefined;

router.post("/client", clientLogLimiter, (req, res) => {
  const { level, message, name, stack, path, componentStack, requestId } = req.body ?? {};

  const safeMessage = asString(message);
  if (!safeMessage) {
    throw new ApiError(400, "message is required");
  }

  const safeLevel = ALLOWED_LEVELS.has(level) ? level : "error";

  logger[safeLevel](`[client] ${safeMessage}`, {
    source: "client",
    clientError: {
      name: asString(name, 200),
      stack: asString(stack, 4000),
      componentStack: asString(componentStack, 4000),
    },
    // The page the failure happened on, not the full URL — a query string can
    // carry a search term or an id the user typed.
    clientPath: asString(path, 300)?.split("?")[0],
    // The id of the API request that failed, when the error came from one.
    // This is what joins the client report to the server-side lines.
    clientRequestId: asString(requestId, 64),
    userAgent: asString(req.headers["user-agent"], 300),
  });

  // 202: recorded, nothing to return. The client must never block on or retry
  // this — a failing log endpoint should not become a second failure.
  new ApiResponse(202, "Recorded").send(res);
});

export default router;

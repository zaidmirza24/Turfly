import { randomUUID } from "node:crypto";
import logger, { runWithContext, getRequestId } from "../utils/logger.js";

/** Header used to accept and echo a correlation id. */
export const REQUEST_ID_HEADER = "x-request-id";

/**
 * Opens a logging context for the request and echoes its id back to the
 * client.
 *
 * The id is what ties a user's report ("it failed at 3pm") to the exact lines
 * this request produced. It is accepted from the caller when present so a
 * trace started in the browser survives the hop into the API, and generated
 * otherwise. It is echoed in the response header (and, for errors, in the
 * response body) so the person hitting the bug can quote it.
 *
 * Must be mounted before any route that logs.
 */
export const requestContext = (req, res, next) => {
  const incoming = req.headers[REQUEST_ID_HEADER];
  // Never trust the caller's value verbatim — it lands in every log line for
  // this request, and an unbounded/newline-bearing string would let a caller
  // forge log entries.
  const requestId =
    typeof incoming === "string" && /^[A-Za-z0-9._-]{8,64}$/.test(incoming) ? incoming : randomUUID();

  res.setHeader(REQUEST_ID_HEADER, requestId);

  // Pinned to the request object as well as the async store. Multer consumes
  // the body as a stream, and the AsyncLocalStorage context does not reliably
  // survive that — which lost the id on exactly the requests (failed uploads)
  // where it matters most. Anything holding a `req` should read this; the
  // async store remains for service-layer code that has no request in scope.
  req.requestId = requestId;

  runWithContext({ requestId }, () => next());
};

/** Fields safe to log about a request — no bodies, no query values, no headers. */
const requestFields = (req) => ({
  method: req.method,
  // req.route is unavailable until routing resolves; the raw path is fine, but
  // the query string is dropped — it can carry search terms and ids that are
  // not worth retaining.
  path: (req.originalUrl || req.url || "").split("?")[0],
});

/**
 * Logs one line per completed request.
 *
 * Level follows the outcome so that filtering on `level>=warn` surfaces
 * exactly the requests that failed: 5xx errors, 4xx warnings, everything else
 * info. Health checks are dropped to debug — on a platform that pings them
 * every few seconds they would otherwise be the bulk of the log volume.
 */
export const requestLogger = (req, res, next) => {
  const startedAt = process.hrtime.bigint();

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const fields = {
      ...requestFields(req),
      status: res.statusCode,
      durationMs: Math.round(durationMs * 10) / 10,
      // Explicit rather than relying on the async store surviving into the
      // 'finish' event of a streamed request body.
      requestId: req.requestId,
      ...(req.user?._id ? { userId: req.user._id.toString() } : {}),
    };

    const isHealthCheck = fields.path === "/api/health" || fields.path === "/";
    const message = `${fields.method} ${fields.path} ${fields.status}`;

    if (res.statusCode >= 500) logger.error(message, fields);
    else if (res.statusCode >= 400) logger.warn(message, fields);
    else if (isHealthCheck) logger.debug(message, fields);
    else logger.info(message, fields);
  });

  next();
};

export { getRequestId };

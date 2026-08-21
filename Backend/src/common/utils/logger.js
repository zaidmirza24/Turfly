import { AsyncLocalStorage } from "node:async_hooks";
import env from "../config/env.js";

/**
 * Structured application logger.
 *
 * Deliberately dependency-free: this is a small JSON-lines writer, not a
 * logging framework. Everything a log aggregator needs is in the emitted
 * object (level, timestamp, message, requestId, context), so the output can be
 * ingested by whatever platform sits in front of it — Vercel's log drains,
 * CloudWatch, Datadog — without a transport plugin.
 *
 * Two output modes:
 *  - production: one JSON object per line, machine-parseable
 *  - development: a short coloured line, with the context object expanded
 *    underneath only when there is one
 */

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

const configuredLevel = (() => {
  const explicit = String(env.LOG_LEVEL || "").toLowerCase();
  if (explicit && explicit in LEVELS) return LEVELS[explicit];
  return env.NODE_ENV === "production" ? LEVELS.info : LEVELS.debug;
})();

/**
 * Request-scoped context.
 *
 * AsyncLocalStorage (Node core) carries the current request's id and actor
 * through every await in the handler, so a service five calls deep can log
 * without having a `req` threaded into it. This is what makes it possible to
 * follow one user's request across every line it produced.
 */
const requestContext = new AsyncLocalStorage();

export const runWithContext = (context, fn) => requestContext.run(context, fn);

/** Merge extra fields into the current request's context (e.g. userId after auth). */
export const addContext = (fields) => {
  const store = requestContext.getStore();
  if (store) Object.assign(store, fields);
};

export const getRequestId = () => requestContext.getStore()?.requestId;

// ── Redaction ────────────────────────────────────────────────────────────

/**
 * Keys whose values must never reach a log line.
 *
 * Two categories, both non-negotiable:
 *  - credentials (password, token, authorization, secret, cookie) — logs are
 *    routinely shipped to third-party aggregators and read by people who are
 *    not entitled to them
 *  - personal data (email, phone, name, address) — this platform stores real
 *    customers' contact details, and a log line is not a lawful place to keep
 *    them. Records are identified by id instead, which is enough to look the
 *    row up deliberately.
 */
const REDACTED_KEYS = new Set([
  "password",
  "newpassword",
  "currentpassword",
  "confirmpassword",
  "token",
  "accesstoken",
  "refreshtoken",
  "jwt",
  "authorization",
  "auth",
  "cookie",
  "secret",
  "apikey",
  "api_key",
  "mongo_uri",
  "mongouri",
  "jwt_secret",
  "cron_secret",
  "email",
  "phone",
  "name",
  "fullname",
  "address",
  "data", // raw file/binary payloads
]);

const REDACTED = "[redacted]";
const MAX_DEPTH = 6;
const MAX_ARRAY = 20;
const MAX_STRING = 2000;

/**
 * A connection string carries its credentials inline, so it has to be scrubbed
 * by shape as well as by key name — it can turn up inside an arbitrary driver
 * error message, where no key name protects it.
 */
const scrubString = (value) => {
  let out = value.replace(/(mongodb(?:\+srv)?:\/\/)[^@\s]+@/gi, "$1<credentials>@");
  out = out.replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer <token>");
  // Bare JWTs (three base64url segments) can appear in error text on their own.
  out = out.replace(/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/g, "<jwt>");
  return out.length > MAX_STRING ? `${out.slice(0, MAX_STRING)}…[truncated]` : out;
};

const sanitize = (value, depth = 0) => {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return scrubString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function") return "[function]";
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return `[buffer ${value.length} bytes]`;

  if (value instanceof Error) {
    return {
      name: value.name,
      message: scrubString(value.message),
      ...(value.statusCode ? { statusCode: value.statusCode } : {}),
      ...(value.code ? { code: String(value.code) } : {}),
      stack: value.stack ? scrubString(value.stack) : undefined,
    };
  }

  if (depth >= MAX_DEPTH) return "[max depth]";

  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ARRAY).map((v) => sanitize(v, depth + 1));
    if (value.length > MAX_ARRAY) items.push(`…${value.length - MAX_ARRAY} more`);
    return items;
  }

  if (typeof value === "object") {
    // Mongoose documents and ObjectIds are noisy and can carry the whole
    // record (PII included) into a log line. Reduce them to their identity.
    if (typeof value.toHexString === "function") return value.toHexString();
    if (value._id && typeof value.toObject === "function") {
      return { _id: String(value._id), model: value.constructor?.modelName };
    }

    const out = {};
    for (const [key, val] of Object.entries(value)) {
      out[key] = REDACTED_KEYS.has(key.toLowerCase()) ? REDACTED : sanitize(val, depth + 1);
    }
    return out;
  }

  return String(value);
};

// ── Emission ─────────────────────────────────────────────────────────────

const DEV_COLOURS = {
  debug: "\x1b[90m",
  info: "\x1b[36m",
  warn: "\x1b[33m",
  error: "\x1b[31m",
};
const RESET = "\x1b[0m";

const emit = (level, message, context) => {
  if (LEVELS[level] < configuredLevel) return;

  const store = requestContext.getStore();
  const entry = {
    level,
    time: new Date().toISOString(),
    msg: String(message),
    ...(store?.requestId ? { requestId: store.requestId } : {}),
    ...(store?.userId ? { userId: String(store.userId) } : {}),
    ...(store?.role ? { role: store.role } : {}),
    ...(context ? sanitize(context) : {}),
  };

  // console is the transport, not the interface: on every platform this
  // deploys to, stdout/stderr *is* the log pipeline. Call sites use the
  // logger so that structure, level filtering and redaction always apply.
  const write = level === "error" || level === "warn" ? console.error : console.log;

  if (env.NODE_ENV === "production") {
    write(JSON.stringify(entry));
    return;
  }

  const { level: _l, time, msg, ...rest } = entry;
  const colour = DEV_COLOURS[level] || "";
  const head = `${colour}${level.toUpperCase().padEnd(5)}${RESET} ${time.slice(11, 23)} ${msg}`;
  write(Object.keys(rest).length > 0 ? `${head} ${JSON.stringify(rest)}` : head);
};

const logger = {
  debug: (message, context) => emit("debug", message, context),
  info: (message, context) => emit("info", message, context),
  warn: (message, context) => emit("warn", message, context),
  error: (message, context) => emit("error", message, context),

  /** Logger bound to fixed fields, e.g. logger.child({ job: "slotCleanup" }). */
  child(bound) {
    return {
      debug: (m, c) => emit("debug", m, { ...bound, ...c }),
      info: (m, c) => emit("info", m, { ...bound, ...c }),
      warn: (m, c) => emit("warn", m, { ...bound, ...c }),
      error: (m, c) => emit("error", m, { ...bound, ...c }),
    };
  },
};

export { sanitize };
export default logger;

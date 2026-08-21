/**
 * Structured client-side logging.
 *
 * Mirrors the backend logger (Backend/src/common/utils/logger.js): same
 * levels, same redaction rules, same "context object" shape — so a failure
 * that spans both halves of a request reads the same way in both places.
 *
 * Two outputs:
 *  - the browser console, formatted for a human, filtered by level
 *  - for `warn` and `error`, a report POSTed to /api/logs/client so that a
 *    crash in someone's browser is visible to whoever operates the platform,
 *    instead of only to the one person who hit it
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const isProd = import.meta.env.PROD;

// Quieter in production: `debug` is for tracing a flow while developing, and
// shipping it to real users' consoles only leaks implementation detail.
const minLevel = isProd ? LEVELS.warn : LEVELS.debug;

export interface LogContext {
  [key: string]: unknown;
}

// ── Redaction ────────────────────────────────────────────────────────────

/**
 * Same rule as the server: credentials and personal data never enter a log
 * record. On the client this matters twice over — these objects are written to
 * a console the user can screenshot into a support ticket, and `warn`/`error`
 * entries are transmitted off the device.
 */
const REDACTED_KEYS = new Set([
  'password',
  'newpassword',
  'confirmpassword',
  'token',
  'accesstoken',
  'refreshtoken',
  'jwt',
  'authorization',
  'auth',
  'cookie',
  'secret',
  'apikey',
  'email',
  'phone',
  'name',
  'fullname',
  'address',
]);

const REDACTED = '[redacted]';
const MAX_DEPTH = 5;
const MAX_STRING = 1000;

const scrubString = (value: string): string => {
  const out = value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer <token>')
    .replace(/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/g, '<jwt>');
  return out.length > MAX_STRING ? `${out.slice(0, MAX_STRING)}…[truncated]` : out;
};

export function sanitize(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return scrubString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'function') return '[function]';

  if (value instanceof Error) {
    return {
      name: value.name,
      message: scrubString(value.message),
      stack: value.stack ? scrubString(value.stack) : undefined,
    };
  }

  if (depth >= MAX_DEPTH) return '[max depth]';

  if (Array.isArray(value)) {
    return value.slice(0, 20).map(v => sanitize(v, depth + 1));
  }

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = REDACTED_KEYS.has(key.toLowerCase()) ? REDACTED : sanitize(val, depth + 1);
    }
    return out;
  }

  return String(value);
}

// ── Remote reporting ─────────────────────────────────────────────────────

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

/**
 * Guards against a broken page reporting the same error on every render and
 * turning a display bug into a flood of requests.
 */
const MAX_REPORTS_PER_SESSION = 20;
const seen = new Set<string>();
let reportCount = 0;

interface ReportInput {
  level: 'warn' | 'error';
  message: string;
  error?: unknown;
  context?: LogContext;
}

function report({ level, message, error, context }: ReportInput): void {
  const err = error instanceof Error ? error : undefined;
  const dedupeKey = `${level}:${message}:${err?.stack?.slice(0, 200) ?? ''}`;

  if (seen.has(dedupeKey) || reportCount >= MAX_REPORTS_PER_SESSION) return;
  seen.add(dedupeKey);
  reportCount += 1;

  const body = JSON.stringify({
    level,
    message: scrubString(message),
    name: err?.name,
    stack: err?.stack ? scrubString(err.stack) : undefined,
    componentStack: typeof context?.componentStack === 'string' ? scrubString(context.componentStack) : undefined,
    // Path only — the query string can carry a search term or an id the user
    // typed, which is theirs and not ours to collect.
    path: window.location.pathname,
    requestId: typeof context?.requestId === 'string' ? context.requestId : undefined,
  });

  // keepalive so a report sent during navigation or unload still goes out.
  // Failures are swallowed on purpose: logging must never be able to raise a
  // second error on top of the one being reported.
  void fetch(`${API_BASE_URL}/logs/client`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {
    /* reporting is best-effort */
  });
}

// ── Emission ─────────────────────────────────────────────────────────────

function emit(level: LogLevel, message: string, context?: LogContext): void {
  if (LEVELS[level] < minLevel) return;

  const safeContext = context ? (sanitize(context) as LogContext) : undefined;
  const prefix = `[${level}] ${message}`;

  const write =
    level === 'error' ? console.error : level === 'warn' ? console.warn : level === 'info' ? console.info : console.debug;

  if (safeContext && Object.keys(safeContext).length > 0) write(prefix, safeContext);
  else write(prefix);
}

export const logger = {
  debug: (message: string, context?: LogContext) => emit('debug', message, context),
  info: (message: string, context?: LogContext) => emit('info', message, context),

  warn: (message: string, context?: LogContext) => {
    emit('warn', message, context);
    report({ level: 'warn', message, context });
  },

  /**
   * `error` takes the Error itself as a second argument so the stack survives
   * — the single most useful field, and the one lost by `logger.error(String(e))`.
   */
  error: (message: string, error?: unknown, context?: LogContext) => {
    emit('error', message, { ...context, ...(error !== undefined ? { err: error } : {}) });
    report({ level: 'error', message, error, context });
  },
};

/**
 * Catches the two classes of failure that never reach a try/catch or an error
 * boundary: rejected promises with no handler, and errors thrown outside React
 * (event handlers on plain DOM nodes, third-party scripts).
 */
export function installGlobalErrorHandlers(): void {
  window.addEventListener('unhandledrejection', event => {
    logger.error('Unhandled promise rejection', event.reason);
  });

  window.addEventListener('error', event => {
    // Resource load failures (a broken <img>) also fire this with no `error`;
    // they aren't application faults and would drown out real ones.
    if (!event.error) return;
    logger.error('Uncaught error', event.error, { source: event.filename, line: event.lineno });
  });
}

export default logger;

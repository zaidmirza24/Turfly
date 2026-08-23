import env from "../../common/config/env.js";

/**
 * Every dynamic string dropped into these templates ultimately traces back
 * to user input — a customer's own profile name, an owner's turf name/
 * location, a cancellation reason — none of which is validated for HTML
 * safety anywhere upstream (it's free-text, correctly so for its own
 * purpose). Interpolating it unescaped would let e.g. a customer set their
 * name to markup and have it render in the *owner's* inbox on every new
 * booking. HTML email clients don't execute <script>, but they do render
 * links/buttons/images, which is enough for a convincing phishing-style
 * spoof inside an otherwise-trusted transactional email — so every value
 * that isn't already a number or a value this module itself formatted goes
 * through this first.
 */
const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));

const rupees = (n) => `₹${Number(n).toLocaleString("en-IN")}`;

const fmtDate = (date) =>
  new Date(date).toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

const fmtTime = (date) =>
  new Date(date).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });

const BRAND = "Turf Booking";
const PRIMARY = "#16a34a";

/**
 * Shared HTML shell every transactional email is wrapped in. Kept dependency
 * -free (no MJML/build step) — Brevo just needs a self-contained HTML string.
 */
const layout = (title, bodyHtml, { ctaLabel, ctaUrl } = {}) => `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f5f7;font-family:Segoe UI,Arial,sans-serif;color:#1f2937;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 0;">
      <tr><td align="center">
        <table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
          <tr><td style="background:${PRIMARY};padding:20px 28px;">
            <span style="color:#fff;font-size:18px;font-weight:700;">${BRAND}</span>
          </td></tr>
          <tr><td style="padding:28px;">
            <h1 style="font-size:20px;margin:0 0 12px;">${title}</h1>
            ${bodyHtml}
            ${ctaUrl ? `<div style="margin-top:24px;"><a href="${ctaUrl}" style="background:${PRIMARY};color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;display:inline-block;">${ctaLabel}</a></div>` : ""}
          </td></tr>
          <tr><td style="padding:16px 28px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;">
            Need help? ${env.SUPPORT_EMAIL ? `Contact us at <a href="mailto:${env.SUPPORT_EMAIL}">${env.SUPPORT_EMAIL}</a>.` : "Reach out via the Help page in the app."}
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

// `label` is always one of this module's own literal strings; `value` is
// frequently user/owner-supplied (a name, a reason, a venue), so it's the
// one that needs escaping — see escapeHtml's comment above.
const row = (label, value) =>
  `<tr><td style="padding:4px 0;color:#6b7280;font-size:14px;">${label}</td><td style="padding:4px 0;text-align:right;font-weight:600;font-size:14px;">${escapeHtml(value)}</td></tr>`;

const table = (rows) => `<table role="presentation" width="100%" style="margin-top:12px;border-top:1px solid #e5e7eb;padding-top:8px;">${rows.join("")}</table>`;

const bookingRef = (booking) => booking.groupId || booking._id;

const viewBookingUrl = () => `${env.FRONTEND_URL}/dashboard`;

// ── Customer emails ────────────────────────────────────────────────────

export const bookingConfirmedEmail = (bookings, payment, turf, slots, customerName) => {
  const total = bookings.reduce((s, b) => s + b.amount, 0);
  const first = slots[0];
  const last = slots[slots.length - 1];
  const rows = [
    row("Booking reference", `#${bookingRef(bookings[0])}`),
    row("Venue", turf.name),
    row("Address", turf.location),
    row("Date", fmtDate(first.startTime)),
    row("Time", `${fmtTime(first.startTime)} – ${fmtTime(last.endTime)}`),
    row("Duration", `${slots.length * 30} min`),
    row("Amount paid", rupees(total)),
    row("Payment status", "Paid"),
    row("Booking status", "Confirmed"),
  ];
  const html = layout(
    "Booking Confirmed 🎉",
    `<p>Hi ${escapeHtml(customerName)},</p>
     <p>Your booking at <strong>${escapeHtml(turf.name)}</strong> is confirmed.</p>
     ${table(rows)}
     <p style="margin-top:16px;font-size:13px;color:#6b7280;">Cancellation policy: free cancellation up to 6 hours before your slot starts, from My Bookings.</p>`,
    { ctaLabel: "View booking", ctaUrl: viewBookingUrl() }
  );
  return { subject: `Booking confirmed at ${turf.name}`, html };
};

export const paymentSuccessEmail = (payment, bookings, turf) => {
  const rows = [
    row("Payment reference", payment.razorpayPaymentId),
    row("Booking reference", `#${bookingRef(bookings[0])}`),
    row("Amount", rupees(payment.amount)),
    row("Date & time", `${fmtDate(payment.paidAt)} ${fmtTime(payment.paidAt)}`),
    row("Venue", turf?.name || "-"),
  ];
  const html = layout("Payment Successful", `<p>We've received your payment.</p>${table(rows)}`, {
    ctaLabel: "View booking",
    ctaUrl: viewBookingUrl(),
  });
  return { subject: "Payment successful", html };
};

export const paymentFailedEmail = (payment) => {
  const rows = [
    row("Booking reference", payment.groupId),
    row("Amount", rupees(payment.amount)),
    row("Status", "Payment failed"),
    ...(payment.failureReason ? [row("Reason", payment.failureReason)] : []),
  ];
  const html = layout(
    "Payment Failed",
    `<p>Your payment could not be completed. Your slot hold is still active for a short while — you can retry from the app.</p>${table(rows)}`,
    { ctaLabel: "Retry payment", ctaUrl: `${env.FRONTEND_URL}/turfs` }
  );
  return { subject: "Payment failed — retry your booking", html };
};

export const bookingCancelledEmail = (booking, turf, refundInfo) => {
  const rows = [
    row("Booking reference", `#${bookingRef(booking)}`),
    row("Venue", turf?.name || "-"),
    ...(booking.notes ? [row("Reason", booking.notes)] : []),
    row("Refund amount", refundInfo?.refunded ? rupees(booking.amount) : rupees(0)),
    row("Refund status", refundInfo?.refunded ? "Initiated" : "Not applicable"),
  ];
  const html = layout("Booking Cancelled", `<p>Your booking has been cancelled.</p>${table(rows)}`);
  return { subject: "Booking cancelled", html };
};

export const refundInitiatedEmail = (booking, payment, refundId) => {
  const rows = [
    row("Refund amount", rupees(booking.amount)),
    row("Original payment", payment.razorpayPaymentId),
    row("Refund reference", refundId),
  ];
  const html = layout(
    "Refund Initiated",
    `<p>We've initiated your refund. It typically takes 5-7 business days to reflect, depending on your bank.</p>${table(rows)}`
  );
  return { subject: "Refund initiated", html };
};

export const refundCompletedEmail = (booking, payment, refundId) => {
  const rows = [
    row("Refund amount", rupees(booking.refundAmount || booking.amount)),
    row("Refund reference", refundId),
    row("Original booking", `#${bookingRef(booking)}`),
  ];
  const html = layout("Refund Completed", `<p>Your refund has been processed.</p>${table(rows)}`);
  return { subject: "Refund completed", html };
};

export const paymentSucceededBookingFailedEmail = (payment) => {
  const html = layout(
    "We're sorry — your slot became unavailable",
    `<p>Your payment of ${rupees(payment.amount)} was received, but the slot you booked was taken by another customer in the same moment.
     We've automatically initiated a full refund — no action is needed from you.</p>`
  );
  return { subject: "Payment received but slot unavailable — refund initiated", html };
};

export const bookingReminderEmail = (booking, turf, slot) => {
  const rows = [row("Venue", turf.name), row("Date", fmtDate(slot.startTime)), row("Time", fmtTime(slot.startTime))];
  const html = layout("Upcoming Booking Reminder", `<p>This is a reminder of your upcoming booking.</p>${table(rows)}`);
  return { subject: `Reminder: your booking at ${turf.name}`, html };
};

// ── Owner emails ───────────────────────────────────────────────────────

export const ownerNewBookingEmail = (bookings, turf, customerName) => {
  const total = bookings.reduce((s, b) => s + b.amount, 0);
  const rows = [row("Customer", customerName), row("Slots", bookings.length), row("Amount", rupees(total))];
  const html = layout("New Confirmed Booking", `<p>You have a new confirmed booking at <strong>${escapeHtml(turf.name)}</strong>.</p>${table(rows)}`);
  return { subject: `New booking at ${turf.name}`, html };
};

export const ownerBookingCancelledEmail = (booking, turf) => {
  const rows = [row("Booking reference", `#${bookingRef(booking)}`), row("Amount", rupees(booking.amount))];
  const html = layout("Booking Cancelled", `<p>A booking at <strong>${escapeHtml(turf.name)}</strong> was cancelled.</p>${table(rows)}`);
  return { subject: `Booking cancelled at ${turf.name}`, html };
};

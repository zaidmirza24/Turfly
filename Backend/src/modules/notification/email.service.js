import NotificationLog from "./notificationLog.model.js";
import { sendTransactionalEmail } from "./brevo.client.js";
import { isBrevoConfigured } from "../../common/config/env.js";
import Turf from "../turf/turf.model.js";
import Slot from "../slot/slot.model.js";
import User from "../user/user.model.js";
import logger from "../../common/utils/logger.js";
import * as tpl from "./email.templates.js";

const log = logger.child({ module: "email" });

/**
 * Every outbound email goes through here — Phase 17's "centralized email
 * service" and Phase 22's idempotent notification log in one place.
 *
 * `dedupeKey` is what makes duplicate webhook deliveries safe: four
 * `payment.captured` deliveries for the same payment must still send exactly
 * one "booking confirmed" email. The unique index on NotificationLog.dedupeKey
 * is the actual enforcement — a duplicate-key error on the claiming insert
 * means "already sent or in flight," not a bug.
 *
 * Never throws — a broken email integration must never fail the payment or
 * booking operation that triggered it (Phase 20). Callers that want to know
 * whether the send worked can inspect the returned NotificationLog.
 */
const sendOnce = async ({ type, recipientEmail, bookingId, paymentId, dedupeKeySuffix, subject, html }) => {
  if (!recipientEmail) return null;
  const dedupeKey = `${type}:${dedupeKeySuffix}`;

  let logRow;
  try {
    logRow = await NotificationLog.create({ dedupeKey, type, recipientEmail, bookingId, paymentId, status: "PENDING" });
  } catch (err) {
    if (err.code === 11000) {
      const existing = await NotificationLog.findOne({ dedupeKey });
      if (!existing || existing.status === "SENT") {
        log.debug("Skipping duplicate notification", { dedupeKey, type });
        return existing || null;
      }
      logRow = existing; // a prior attempt failed — allowed to retry
    } else {
      log.error("Failed to write notification log row", { err, type });
      return null;
    }
  }

  if (!isBrevoConfigured()) {
    log.warn("Brevo is not configured — skipping email send", { type, recipientEmail });
    logRow.status = "FAILED";
    logRow.lastError = "Brevo not configured";
    logRow.attemptCount += 1;
    await logRow.save();
    return logRow;
  }

  try {
    const providerMessageId = await sendTransactionalEmail({ to: recipientEmail, subject, html });
    logRow.status = "SENT";
    logRow.providerMessageId = providerMessageId;
    logRow.sentAt = new Date();
    logRow.attemptCount += 1;
    await logRow.save();
    log.info("Email sent", { type, dedupeKey, providerMessageId });
  } catch (err) {
    logRow.status = "FAILED";
    logRow.lastError = String(err.message || err);
    logRow.attemptCount += 1;
    await logRow.save();
    log.error("Email send failed", { err, type, dedupeKey });
  }
  return logRow;
};

const customerOf = async (userId) => User.findById(userId).select("name email");
const turfOf = async (turfId) => Turf.findById(turfId).select("name location rules");
const slotsOf = async (slotIds) => Slot.find({ _id: { $in: slotIds } }).select("startTime endTime").sort({ startTime: 1 });

export const sendBookingConfirmed = async (bookings, payment) => {
  const [customer, turf, slots] = await Promise.all([
    customerOf(payment.userId),
    turfOf(payment.turfId),
    slotsOf(payment.slotIds),
  ]);
  if (!customer || !turf) return;
  const { subject, html } = tpl.bookingConfirmedEmail(bookings, payment, turf, slots, customer.name);
  return sendOnce({
    type: "BOOKING_CONFIRMED",
    recipientEmail: customer.email,
    bookingId: bookings[0]?._id,
    paymentId: payment._id,
    dedupeKeySuffix: payment.groupId,
    subject,
    html,
  });
};

export const sendPaymentSuccess = async (payment, bookings) => {
  const [customer, turf] = await Promise.all([customerOf(payment.userId), turfOf(payment.turfId)]);
  if (!customer) return;
  const { subject, html } = tpl.paymentSuccessEmail(payment, bookings, turf);
  return sendOnce({
    type: "PAYMENT_SUCCESS",
    recipientEmail: customer.email,
    paymentId: payment._id,
    bookingId: bookings[0]?._id,
    dedupeKeySuffix: payment._id,
    subject,
    html,
  });
};

export const sendPaymentFailure = async (payment) => {
  const customer = await customerOf(payment.userId);
  if (!customer) return;
  const { subject, html } = tpl.paymentFailedEmail(payment);
  // Deduped per attempt count, not per payment — a customer who fails, fixes
  // their card, and fails again on the same order should be told each time.
  return sendOnce({
    type: "PAYMENT_FAILED",
    recipientEmail: customer.email,
    paymentId: payment._id,
    dedupeKeySuffix: `${payment._id}:${payment.attempts.length}`,
    subject,
    html,
  });
};

export const sendPaymentSucceededBookingFailed = async (payment) => {
  const customer = await customerOf(payment.userId);
  if (!customer) return;
  const { subject, html } = tpl.paymentSucceededBookingFailedEmail(payment);
  return sendOnce({
    type: "PAYMENT_FAILED",
    recipientEmail: customer.email,
    paymentId: payment._id,
    dedupeKeySuffix: `${payment._id}:booking-failed`,
    subject,
    html,
  });
};

export const sendBookingCancelled = async (booking) => {
  const [customer, turf] = await Promise.all([customerOf(booking.userId), turfOf(booking.turfId)]);
  if (!customer) return;
  const { subject, html } = tpl.bookingCancelledEmail(booking, turf);
  return sendOnce({
    type: "BOOKING_CANCELLED",
    recipientEmail: customer.email,
    bookingId: booking._id,
    dedupeKeySuffix: booking._id,
    subject,
    html,
  });
};

export const sendRefundCompleted = async (booking, payment, refundId) => {
  const customer = await customerOf(booking.userId);
  if (!customer) return;
  const { subject, html } = tpl.refundCompletedEmail(booking, payment, refundId);
  return sendOnce({
    type: "REFUND_COMPLETED",
    recipientEmail: customer.email,
    bookingId: booking._id,
    paymentId: payment._id,
    dedupeKeySuffix: refundId,
    subject,
    html,
  });
};

export const sendBookingReminder = async (booking) => {
  const [customer, turf, [slot]] = await Promise.all([
    customerOf(booking.userId),
    turfOf(booking.turfId),
    slotsOf([booking.slotId]),
  ]);
  if (!customer || !turf || !slot) return;
  const { subject, html } = tpl.bookingReminderEmail(booking, turf, slot);
  return sendOnce({
    type: "BOOKING_REMINDER",
    recipientEmail: customer.email,
    bookingId: booking._id,
    dedupeKeySuffix: booking._id,
    subject,
    html,
  });
};

export const sendPasswordReset = async (user, resetUrl) => {
  const { subject, html } = tpl.passwordResetEmail(user.name, resetUrl);
  // Deduped per-token (embedded in resetUrl) rather than per-user, so a
  // customer who requests a second reset a minute later still gets that
  // second (different) email instead of it being silently swallowed as a
  // duplicate of the first.
  return sendOnce({
    type: "PASSWORD_RESET",
    recipientEmail: user.email,
    dedupeKeySuffix: resetUrl,
    subject,
    html,
  });
};

export const sendOtpEmail = async (user, otp) => {
  const { subject, html } = tpl.otpEmail(user.name, otp);
  // Deduped per-code (embedded in the key) rather than per-user, so
  // resendOtp issuing a second, different code still actually sends it
  // instead of being swallowed as a duplicate of the first.
  return sendOnce({
    type: "OTP_VERIFICATION",
    recipientEmail: user.email,
    dedupeKeySuffix: `${user._id}:${otp}`,
    subject,
    html,
  });
};

export const sendOwnerNewBooking = async (bookings, payment) => {
  const turf = await turfOf(payment.turfId);
  if (!turf) return;
  const owner = await User.findById(turf.ownerId).select("name email");
  const customer = await customerOf(payment.userId);
  if (!owner || !customer) return;
  const { subject, html } = tpl.ownerNewBookingEmail(bookings, turf, customer.name);
  return sendOnce({
    type: "OWNER_NEW_BOOKING",
    recipientEmail: owner.email,
    bookingId: bookings[0]?._id,
    paymentId: payment._id,
    dedupeKeySuffix: payment.groupId,
    subject,
    html,
  });
};

export const sendOwnerBookingCancelled = async (booking) => {
  const turf = await turfOf(booking.turfId);
  if (!turf) return;
  const owner = await User.findById(turf.ownerId).select("name email");
  if (!owner) return;
  const { subject, html } = tpl.ownerBookingCancelledEmail(booking, turf);
  return sendOnce({
    type: "OWNER_BOOKING_CANCELLED",
    recipientEmail: owner.email,
    bookingId: booking._id,
    dedupeKeySuffix: booking._id,
    subject,
    html,
  });
};

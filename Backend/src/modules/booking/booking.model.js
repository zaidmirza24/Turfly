import mongoose from "mongoose";
import { toRupees } from "../../common/utils/money.js";

const bookingSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User reference is required"],
      index: true,
    },
    turfId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Turf",
      required: [true, "Turf reference is required"],
      // Queried on every owner bookings view (getBookingsByTurf / getOwnerBookings).
      index: true,
    },
    slotId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Slot",
      required: [true, "Slot reference is required"],
    },
    // Copied from the slot at confirmation time (confirmSlot). Denormalised
    // deliberately: *when the booking is played* is the field every
    // operational view actually needs to filter, sort and paginate by, and it
    // lived only on the referenced Slot document — unreachable from a Mongo
    // query without a $lookup. That's why the owner's date filter and every
    // booking list ordered by `createdAt` instead, i.e. by when the booking
    // was made, so "show me today" returned bookings *placed* today rather
    // than the day's actual schedule.
    //
    // Safe to denormalise because it never changes: a slot's time is fixed at
    // creation, and moving a booking to a different time isn't supported (a
    // reschedule would be a new booking). The slot remains the source of
    // truth; these are a queryable copy.
    slotStartTime: {
      type: Date,
      required: [true, "Slot start time is required"],
      index: true,
    },
    slotEndTime: {
      type: Date,
      required: [true, "Slot end time is required"],
    },
    // CONFIRMED is the live state: booked and not yet played. COMPLETED and
    // NO_SHOW are both terminal and both mean the slot has passed — they
    // differ only in whether the customer turned up, which is the distinction
    // the platform previously had no way to record at all. Everything used to
    // infer "completed" from `slotEndTime < now`, which silently counted a
    // no-show as a played session: owners couldn't flag one, repeat offenders
    // were invisible, and a "they never showed" dispute had nothing to
    // resolve against.
    //
    // COMPLETED is set lazily rather than by a scheduler — see
    // `settleFinishedBookings`. NO_SHOW is only ever set deliberately, by the
    // owner or an admin.
    status: {
      type: String,
      enum: ["CONFIRMED", "COMPLETED", "NO_SHOW", "CANCELLED"],
      default: "CONFIRMED",
    },
    // Who cancelled this booking, distinct from just knowing that it's
    // cancelled — needed for refund policy and reporting. CUSTOMER is the
    // self-service cancel path; OWNER/ADMIN is cancelBookingAsOwner
    // (booking.service.js — a venue emergency or voiding a no-show, with no
    // 6-hour cutoff); SYSTEM is an automated force-cancel (payment captured
    // but the slot couldn't be claimed, or a refund issued outside the app
    // that this codebase reconciles after the fact).
    cancelledBy: {
      type: String,
      enum: ["CUSTOMER", "OWNER", "ADMIN", "SYSTEM"],
      default: null,
    },
    amountPaise: {
      type: Number,
      required: [true, "Booking amount is required"],
      min: [0, "Amount cannot be negative"],
      validate: { validator: Number.isInteger, message: "amountPaise must be an integer" },
    },
    // Links bookings created together in one multi-slot checkout. Each slot
    // still gets its own Booking document (existing single-slot code paths —
    // cancellation, owner views — need no changes), groupId just lets the
    // frontend show/cancel them as one logical booking. null for a normal
    // single-slot booking.
    groupId: {
      type: String,
      default: null,
      index: true,
    },
    // MARKED_REFUNDED is the owner's own bookkeeping note that they refunded
    // a CASH/PENDING booking outside the app (cash handback, UPI transfer,
    // etc) — there's no real payment gateway record for those, so nothing
    // here moves real money; it's a status label, not a refund transaction.
    // PENDING bookings (no real money ever moved). The rest track a real
    // Razorpay refund lifecycle for ONLINE bookings (payment.service.js):
    // REFUND_PENDING is set the moment a refund is accepted by Razorpay,
    // REFUNDED only once the `refund.processed` webhook confirms it landed.
    refundStatus: {
      type: String,
      enum: ["NONE", "MARKED_REFUNDED", "REFUND_PENDING", "REFUNDED", "REFUND_FAILED"],
      default: "NONE",
    },
    refundAmountPaise: {
      type: Number,
      default: 0,
      min: 0,
      validate: { validator: Number.isInteger, message: "refundAmountPaise must be an integer" },
    },
    // Set once a real online payment confirms this booking (payment.service.js
    // finalizePaymentSuccess). null for CASH/manual owner bookings, which have
    // no payment gateway record.
    paymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payment",
      default: null,
      index: true,
    },
    // Free-text note — a cancellation reason, or context an owner attaches to
    // a manually-created booking.
    notes: {
      type: String,
      default: null,
      maxlength: 500,
    },
    // Whether the customer self-booked (normal flow) or an owner entered this
    // on their behalf (phone/walk-in booking created from the owner panel).
    createdBy: {
      type: String,
      enum: ["CUSTOMER", "OWNER"],
      default: "CUSTOMER",
    },
    // How the owner recorded payment for a manually-created booking. ONLINE
    // is the default for customer self-service bookings (today's simulated
    // checkout); CASH/PENDING are only ever set by the owner on a manual
    // booking — there is no real payment collection behind either.
    paymentMethod: {
      type: String,
      enum: ["ONLINE", "CASH", "PENDING"],
      default: "ONLINE",
    },
    // Commission split (payment.service.js finalizePaymentSuccess), set once
    // at booking-confirmation time for ONLINE bookings only — a CASH/PENDING
    // booking never has the platform holding money on the owner's behalf, so
    // there is nothing to split or pay out. Computed from `amount` and
    // env.PLATFORM_COMMISSION_RATE at that moment and never recalculated, so
    // a later rate change can't silently reprice an already-confirmed booking.
    commissionAmountPaise: {
      type: Number,
      default: null,
    },
    ownerAmountPaise: {
      type: Number,
      default: null,
    },
    // NONE: not applicable (CASH/PENDING, or no payment yet). PENDING: owed
    // to the owner, unpaid. PAID: settled, see payoutId. VOID: booking was
    // refunded to the customer while still PENDING — the platform never
    // collected a real commission on this booking, so nothing is owed either
    // way (full clawback). CLAWBACK_OWED: refunded to the customer *after*
    // the owner had already been paid out — the owner now owes that amount
    // back to the platform; there is no automated recovery for this, it's a
    // flag for admin to reconcile manually.
    payoutStatus: {
      type: String,
      enum: ["NONE", "PENDING", "PAID", "VOID", "CLAWBACK_OWED"],
      default: "NONE",
      index: true,
    },
    payoutId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payout",
      default: null,
    },
    paidOutAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true, // createdAt serves as booking time
  }
);

// Matches the hot query shapes in booking.service.js/admin.service.js —
// every owner/admin/customer booking list filters by one of these two
// fields and always sorts by createdAt desc. A single-field index still
// lets Mongo use turfId/userId for the filter, but it then has to
// in-memory-sort every matching document; these let it walk the index in
// createdAt order directly.
bookingSchema.index({ turfId: 1, createdAt: -1 });
bookingSchema.index({ userId: 1, createdAt: -1 });
// The operational query shape: an owner's bookings for a date range, in the
// order they'll actually be played. Mirrors the two above, but on play time
// rather than booking time — see the slotStartTime field comment.
bookingSchema.index({ turfId: 1, slotStartTime: -1 });
bookingSchema.index({ userId: 1, slotStartTime: -1 });

const moneyToJSON = (_doc, ret) => {
  ret.amount = toRupees(ret.amountPaise);
  delete ret.amountPaise;
  ret.refundAmount = toRupees(ret.refundAmountPaise || 0);
  delete ret.refundAmountPaise;
  ret.commissionAmount = ret.commissionAmountPaise != null ? toRupees(ret.commissionAmountPaise) : null;
  delete ret.commissionAmountPaise;
  ret.ownerAmount = ret.ownerAmountPaise != null ? toRupees(ret.ownerAmountPaise) : null;
  delete ret.ownerAmountPaise;
  return ret;
};
bookingSchema.set("toJSON", { transform: moneyToJSON });
bookingSchema.set("toObject", { transform: moneyToJSON });

/**
 * The statuses where the venue keeps the money: the session is booked, played,
 * or was a no-show the customer forfeited. Only CANCELLED is excluded, because
 * only a cancellation refunds.
 *
 * Every revenue total, spend figure and booking count filters on this rather
 * than on CONFIRMED alone. That distinction didn't exist while CONFIRMED was
 * the only non-cancelled status — but the moment a booking can move on to
 * COMPLETED, a query matching CONFIRMED starts quietly *excluding* played
 * sessions, and revenue would fall as bookings finish.
 */
export const HONOURED_STATUSES = ["CONFIRMED", "COMPLETED", "NO_SHOW"];

/** Mongo expression form of the same rule, for use inside aggregations. */
export const IS_HONOURED_EXPR = { $in: ["$status", HONOURED_STATUSES] };

const Booking = mongoose.model("Booking", bookingSchema);
export default Booking;

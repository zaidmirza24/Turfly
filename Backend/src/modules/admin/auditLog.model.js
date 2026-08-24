import mongoose from "mongoose";

/**
 * Record of every admin-triggered mutation — turf approve/reject, user
 * ban/unban, and admin-initiated booking cancel/refund. Nothing here is
 * read by any booking/turf/user flow; it exists purely so a platform admin
 * can be held accountable for what they changed and when.
 */
const auditLogSchema = new mongoose.Schema(
  {
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    action: {
      type: String,
      enum: [
        "TURF_APPROVED",
        "TURF_REJECTED",
        "USER_BANNED",
        "USER_UNBANNED",
        "BOOKING_CANCELLED",
        "BOOKING_NO_SHOW",
        "BOOKING_REFUNDED",
        "BOOKING_PAID_OUT",
        "PAYMENT_RECONCILED",
      ],
      required: true,
    },
    targetType: {
      type: String,
      enum: ["TURF", "USER", "BOOKING", "PAYMENT"],
      required: true,
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: undefined,
    },
  },
  { timestamps: true }
);

auditLogSchema.index({ createdAt: -1 });

const AuditLog = mongoose.model("AuditLog", auditLogSchema);
export default AuditLog;

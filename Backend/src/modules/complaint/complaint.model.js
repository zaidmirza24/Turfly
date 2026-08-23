import mongoose from "mongoose";

// Lightweight support ticket — no message thread, just a description and an
// admin-set resolution note. See admin.service.js's logAdminAction for how
// resolving one gets recorded in the audit trail.
const complaintSchema = new mongoose.Schema(
  {
    raisedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // Denormalized off raisedBy.role at creation time so the admin queue can
    // show/filter "who filed this" without a populate just for that.
    raisedByRole: {
      type: String,
      enum: ["USER", "OWNER"],
      required: true,
    },
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      default: null,
    },
    turfId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Turf",
      default: null,
    },
    category: {
      type: String,
      enum: ["PAYMENT", "BOOKING", "TURF_QUALITY", "BEHAVIOR", "OTHER"],
      required: true,
    },
    description: {
      type: String,
      required: [true, "Description is required"],
      trim: true,
      maxlength: 1000,
    },
    status: {
      type: String,
      enum: ["OPEN", "IN_PROGRESS", "RESOLVED", "DISMISSED"],
      default: "OPEN",
      index: true,
    },
    resolutionNote: {
      type: String,
      default: null,
      maxlength: 1000,
    },
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

complaintSchema.index({ status: 1, createdAt: -1 });

const Complaint = mongoose.model("Complaint", complaintSchema);
export default Complaint;

import mongoose from "mongoose";

// Singleton document — there is only ever one PlatformSettings row (see
// settings.service.js's getSettings, which upserts it lazily instead of
// relying on a seed script). A dedicated collection rather than a key on
// some other model because settings have no natural owner and may grow
// more fields later.
const platformSettingsSchema = new mongoose.Schema(
  {
    // Fraction of every ONLINE booking's amount the platform keeps (0.10 =
    // 10%). Read by payment.service.js's computeCommissionSplit at
    // booking-confirmation time — a change here only affects bookings
    // confirmed after the change, never rewrites an already-stored
    // commissionAmount/ownerAmount.
    commissionRate: {
      type: Number,
      required: true,
      min: 0,
      max: 0.999999,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

const PlatformSettings = mongoose.model("PlatformSettings", platformSettingsSchema);
export default PlatformSettings;

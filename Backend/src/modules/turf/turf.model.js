import mongoose from "mongoose";

const turfSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Owner is required"],
      // Queried on every owner-dashboard load (Turf.find({ ownerId })) and
      // every ownership check in turf/slot mutations.
      index: true,
    },
    name: {
      type: String,
      required: [true, "Turf name is required"],
      trim: true,
      maxlength: [100, "Turf name cannot exceed 100 characters"],
    },
    location: {
      type: String,
      required: [true, "Location is required"],
      trim: true,
    },
    sportsType: {
      type: [String],
      required: [true, "At least one sport type is required"],
      validate: {
        validator: (v) => v.length > 0,
        message: "At least one sport type is required",
      },
    },
    amenities: {
      type: [String],
      default: [],
    },
    pricePerHour: {
      type: Number,
      required: [true, "Price per hour is required"],
      min: [0, "Price cannot be negative"],
    },
    defaultWeekdayPrice: {
      type: Number,
      min: [0, "Price cannot be negative"],
    },
    defaultWeekendPrice: {
      type: Number,
      min: [0, "Price cannot be negative"],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    is24x7: {
      type: Boolean,
      default: true,
    },
    openHour: {
      type: Number,
      min: 0,
      max: 23,
      default: 0,
    },
    closeHour: {
      type: Number,
      min: 0,
      max: 23,
      default: 23,
    },
    approvalStatus: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      default: "PENDING",
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

const Turf = mongoose.model("Turf", turfSchema);
export default Turf;

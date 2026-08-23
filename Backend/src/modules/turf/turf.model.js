import mongoose from "mongoose";
import { toRupees } from "../../common/utils/money.js";

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
    // Owners are asked for this at onboarding and in "Add Turf"; without a
    // schema field Mongoose silently discarded it and the public detail page
    // fell back to generic filler copy for every venue on the platform.
    description: {
      type: String,
      trim: true,
      maxlength: [1000, "Description cannot exceed 1000 characters"],
      default: "",
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
    /**
     * Photo URLs, always our own `/api/images/:id` paths — never an arbitrary
     * external URL. turf.service validates and normalises this through
     * image.service.attachImagesToTurf on every write; the first entry is the
     * one used as the card/listing thumbnail.
     */
    images: {
      type: [String],
      default: [],
    },
    pricePerHourPaise: {
      type: Number,
      required: [true, "Price per hour is required"],
      min: [0, "Price cannot be negative"],
      validate: { validator: Number.isInteger, message: "pricePerHourPaise must be an integer" },
    },
    defaultWeekdayPricePaise: {
      type: Number,
      min: [0, "Price cannot be negative"],
    },
    defaultWeekendPricePaise: {
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
    venueType: {
      type: String,
      enum: ["INDOOR", "OUTDOOR", "BOTH"],
      default: "OUTDOOR",
    },
    capacity: {
      type: Number,
      min: [1, "Capacity must be at least 1"],
    },
    // Shown to customers on the detail page as a way to reach the venue
    // directly. Deliberately separate from the owner's account email/phone —
    // that's login credentials, not a public contact line.
    contactPhone: {
      type: String,
      trim: true,
      maxlength: 20,
    },
    rules: {
      type: String,
      trim: true,
      maxlength: [1000, "Rules cannot exceed 1000 characters"],
      default: "",
    },
    faqs: {
      type: [
        {
          question: { type: String, trim: true, maxlength: 200, required: true },
          answer: { type: String, trim: true, maxlength: 1000, required: true },
        },
      ],
      default: [],
    },
    // GeoJSON point, best-effort geocoded server-side from `location` on
    // create/update (see turf.service.js geocodeLocation). Optional — a
    // failed/skipped geocode just means this turf can't power distance sort,
    // "nearby", or the map embed; it never blocks the listing itself.
    geo: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: { type: [Number], default: undefined }, // [lng, lat]
    },
    // Denormalized so listing/sort queries never need a live join against
    // Booking/Review on every request.
    bookingCount: {
      type: Number,
      default: 0,
    },
    avgRating: {
      type: Number,
      default: 0,
    },
    reviewCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

turfSchema.index({ geo: "2dsphere" });

const moneyToJSON = (_doc, ret) => {
  ret.pricePerHour = toRupees(ret.pricePerHourPaise);
  delete ret.pricePerHourPaise;
  ret.defaultWeekdayPrice = ret.defaultWeekdayPricePaise != null ? toRupees(ret.defaultWeekdayPricePaise) : undefined;
  delete ret.defaultWeekdayPricePaise;
  ret.defaultWeekendPrice = ret.defaultWeekendPricePaise != null ? toRupees(ret.defaultWeekendPricePaise) : undefined;
  delete ret.defaultWeekendPricePaise;
  return ret;
};
turfSchema.set("toJSON", { transform: moneyToJSON });
turfSchema.set("toObject", { transform: moneyToJSON });

const Turf = mongoose.model("Turf", turfSchema);
export default Turf;

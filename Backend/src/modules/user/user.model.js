import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      maxlength: [50, "Name cannot exceed 50 characters"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please provide a valid email"],
    },
    phone: {
      type: String,
      trim: true,
      default: null,
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [6, "Password must be at least 6 characters"],
      select: false, // never returned in queries by default
    },
    role: {
      type: String,
      enum: ["USER", "OWNER", "ADMIN"],
      default: "USER",
    },
    isBanned: {
      type: Boolean,
      default: false,
    },
    // Soft gate on OWNER accounts: a new owner can register/log in
    // immediately, but createTurf (turf.controller.js) refuses until an
    // admin approves them. USER/ADMIN accounts are never vetted, so they
    // default straight to APPROVED — only a fresh OWNER signup starts
    // PENDING (see the default function below, evaluated against `this.role`
    // at document creation).
    approvalStatus: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      default: function () {
        return this.role === "OWNER" ? "PENDING" : "APPROVED";
      },
    },
    // Always one of our own `/api/images/:id` paths (see user.service.js) —
    // never an arbitrary URL, for the same reason turf.images is validated.
    avatar: {
      type: String,
      default: null,
    },
    favorites: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Turf" }],
      default: [],
    },
    // Soft delete: account deletion anonymizes the document in place rather
    // than removing it, because bookings/reviews/turfs elsewhere reference
    // this _id and a hard delete would leave those with a dangling ref (or
    // require a cascade this platform has no product need for — a deleted
    // customer's past bookings should still make sense to the owner who
    // hosted them). `protect` refuses any request from a deleted account,
    // the same way it already refuses a banned one.
    isDeleted: {
      type: Boolean,
      default: false,
    },
    // A customer an owner entered from the panel (phone/walk-in booking) with
    // no real account of their own — no usable password, can never log in.
    isGuest: {
      type: Boolean,
      default: false,
    },
    // Only set on a guest: which owner created them, so customer search stays
    // scoped to that owner's own guests rather than leaking every owner's
    // walk-in customers to every other owner.
    createdByOwnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    // Password reset (auth.service.js requestPasswordReset/resetPassword).
    // Only the SHA-256 hash of the token is stored — same reasoning as never
    // storing the password itself: this document leaking (backup, injection,
    // a careless log line) must not hand out a usable reset link. The token
    // that's actually emailed to the user is only ever compared against this
    // hash, never stored anywhere in cleartext server-side.
    resetPasswordTokenHash: {
      type: String,
      default: null,
      select: false,
    },
    resetPasswordExpires: {
      type: Date,
      default: null,
      select: false,
    },
    // Onboarding email OTP (auth.service.js registerUser/verifyOtp/resendOtp).
    // Defaults to true so this only gates *new* self-service signups — an
    // admin provisioned via seedAdmin.js, an owner-created guest customer, or
    // any account that existed before this feature shipped must never be
    // retroactively locked out of login. registerUser is the one place that
    // explicitly sets this false.
    isEmailVerified: {
      type: Boolean,
      default: true,
    },
    // Same reasoning as resetPasswordTokenHash: only the SHA-256 hash of the
    // OTP is stored, never the code itself, so this document leaking doesn't
    // hand out a working verification code.
    otpHash: {
      type: String,
      default: null,
      select: false,
    },
    otpExpires: {
      type: Date,
      default: null,
      select: false,
    },
    // Wrong-code attempts against the current otpHash. Reset to 0 whenever a
    // fresh code is issued; caps brute-forcing a 6-digit code before the
    // caller has to request a new one (and hit resendOtp's rate limit).
    otpAttempts: {
      type: Number,
      default: 0,
      select: false,
    },
    // Where an admin should send an OWNER's payout (see payout.model.js).
    // Purely informational — nothing in this codebase moves money to it
    // automatically; it exists so the admin settling a payout knows where to
    // actually send it instead of coordinating out-of-band. Only meaningful
    // for role: OWNER.
    payoutDetails: {
      type: {
        method: { type: String, enum: ["UPI", "BANK"], required: true },
        upiId: { type: String, default: null, trim: true },
        bankAccountHolder: { type: String, default: null, trim: true },
        bankAccountNumber: { type: String, default: null, trim: true },
        bankIfsc: { type: String, default: null, trim: true, uppercase: true },
      },
      default: null,
    },
  },
  {
    timestamps: true, // createdAt + updatedAt
  }
);

// Hash password before save
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Instance method: compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model("User", userSchema);
export default User;

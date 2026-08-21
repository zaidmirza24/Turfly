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

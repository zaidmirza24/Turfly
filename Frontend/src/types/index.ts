export type Sport = 'football' | 'cricket' | 'badminton' | 'tennis' | 'basketball' | 'volleyball';

// Status casing matches what the backend actually stores and returns
// (see Backend/src/modules/*/*.model.js). The lowercase variants these types
// used to carry never appeared in a real API response, so every consumer had
// to compare against both — and TypeScript flagged the uppercase half of each
// comparison as impossible.
export type SlotStatus = 'AVAILABLE' | 'LOCKED' | 'BOOKED' | 'CLOSED' | 'FULL';
export type BookingStatus = 'CONFIRMED' | 'CANCELLED';
export type TurfApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type UserRole = 'USER' | 'OWNER' | 'ADMIN';
export type VenueType = 'INDOOR' | 'OUTDOOR' | 'BOTH';

export interface User {
  _id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  avatar?: string | null;
  isBanned?: boolean;
  favorites?: (string | Turf)[];
  createdAt: string;
  // Set only on a customer an owner created from the panel (phone/walk-in
  // booking) — they have no usable password and can never log in.
  isGuest?: boolean;
}

export interface Turf {
  _id: string;
  name: string;
  location: string;
  city?: string;
  description?: string;
  sportsType: string[];
  amenities: string[];
  pricePerHour?: number;
  images?: string[];
  ownerId: string | { _id: string, name: string, email: string };
  isActive: boolean;
  approvalStatus?: TurfApprovalStatus;
  is24x7?: boolean;
  openHour?: number; // 0-23
  closeHour?: number; // 0-23, inclusive of the last slot's start hour
  defaultWeekdayPrice?: number;
  defaultWeekendPrice?: number;
  venueType?: VenueType;
  capacity?: number;
  contactPhone?: string;
  rules?: string;
  faqs?: { question: string; answer: string }[];
  geo?: { type: 'Point'; coordinates: [number, number] }; // [lng, lat]
  bookingCount?: number;
  avgRating?: number;
  reviewCount?: number;
  distanceMeters?: number; // present only on $geoNear ("near") results
}

export interface Review {
  _id: string;
  turfId: string;
  userId: string | { _id: string; name: string };
  bookingId: string;
  rating: number;
  comment: string;
  facilityRatings?: { turfQuality?: number; cleanliness?: number; staffBehavior?: number };
  images?: string[];
  ownerResponse?: { text: string; respondedAt: string };
  reportedBy?: string[];
  createdAt: string;
}

export interface TimeSlot {
  _id: string;
  turfId: string;
  startTime: string; // ISO String from backend
  endTime: string; // ISO String from backend
  status: SlotStatus;
  price: number;
}

/**
 * A booking as the API actually returns it. `turfId`, `userId` and `slotId`
 * arrive populated (objects) on the list endpoints and as plain ids elsewhere,
 * so each is typed as the union rather than pretending it is always a string.
 */
export interface Booking {
  _id: string;
  turfId: string | Pick<Turf, '_id' | 'name' | 'location' | 'sportsType'>;
  userId: string | Pick<User, '_id' | 'name' | 'email' | 'phone'>;
  slotId: string | Pick<TimeSlot, '_id' | 'startTime' | 'endTime' | 'price'>;
  amount: number;
  status: BookingStatus;
  createdAt: string;
  // Present when this booking was created as part of a multi-slot checkout —
  // shared across every booking made in that same checkout, null otherwise.
  groupId?: string | null;
  cancelledBy?: 'CUSTOMER' | 'OWNER' | 'ADMIN' | 'SYSTEM' | null;
  // MARKED_REFUNDED is the owner's manual bookkeeping note for CASH/PENDING
  // bookings (no gateway involved). The rest track a real Razorpay refund
  // against `paymentId` — REFUND_PENDING the moment Razorpay accepts the
  // refund request, REFUNDED only once it's actually confirmed processed.
  refundStatus?: 'NONE' | 'MARKED_REFUNDED' | 'REFUND_PENDING' | 'REFUNDED' | 'REFUND_FAILED';
  refundAmount?: number;
  notes?: string | null;
  // Whether the customer self-booked, or an owner entered this on their
  // behalf from the panel (phone/walk-in booking).
  createdBy?: 'CUSTOMER' | 'OWNER';
  paymentMethod?: 'ONLINE' | 'CASH' | 'PENDING';
  // Populated on owner/admin/customer reads when this booking came from a
  // real online payment (null for CASH/manual bookings).
  paymentId?: string | Payment | null;
}

export type PaymentStatus =
  | 'CREATED'
  | 'ORDER_CREATED'
  | 'AUTHORIZED'
  | 'PAID'
  | 'FAILED'
  | 'EXPIRED'
  | 'PAID_BOOKING_FAILED';

export interface PaymentRefund {
  razorpayRefundId: string;
  amount: number;
  status: 'CREATED' | 'PROCESSED' | 'FAILED';
  createdAt: string;
  processedAt?: string | null;
}

/** Payment.js as returned by GET /api/payments/:id and populated onto Booking.paymentId. */
export interface Payment {
  _id: string;
  status: PaymentStatus;
  razorpayOrderId?: string | null;
  razorpayPaymentId?: string | null;
  amount: number;
  currency: string;
  refunds?: PaymentRefund[];
  failureCode?: string | null;
  failureReason?: string | null;
  paidAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  bookingIds?: string[];
}

/** Response of POST /api/payments/create-order — everything Razorpay Checkout needs. */
export interface CheckoutOrder {
  keyId: string;
  paymentId: string;
  groupId: string;
  orderId: string;
  amount: number; // paise
  currency: string;
  name: string;
  description: string;
  prefill: { name: string; email: string; contact?: string };
}

/** The one pagination shape used across the backend's paginated list endpoints. */
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pages: number;
}

/** One row of the owner's aggregated customer list — derived from Booking, no separate Customer collection. */
export interface CustomerSummary {
  userId: string;
  name: string;
  email: string;
  phone: string;
  isGuest?: boolean;
  totalBookings: number;
  confirmedCount: number;
  cancelledCount: number;
  totalSpent: number;
  lastBookingAt: string;
}

export interface CustomerDetail {
  customer: Pick<User, '_id' | 'name' | 'email' | 'phone' | 'isGuest'>;
  stats: {
    totalBookings: number;
    confirmedCount: number;
    cancelledCount: number;
    totalSpent: number;
  };
  bookings: Booking[];
}

/** Platform-wide admin stats, including the 14-day series behind the Overview chart. */
export interface AdminStats {
  totalUsers: number;
  totalTurfs: number;
  totalBookings: number;
  totalRevenue: number;
  dailySeries: { date: string; bookings: number; revenue: number }[];
}

/** A single turf's slot-status breakdown, for the admin approval-queue detail drawer. */
export interface TurfDetail {
  turf: Turf & { ownerId: { _id: string; name: string; email: string; phone?: string } };
  slotSummary: Partial<Record<SlotStatus, number>>;
}

export type AdminAction =
  | 'TURF_APPROVED'
  | 'TURF_REJECTED'
  | 'USER_BANNED'
  | 'USER_UNBANNED'
  | 'BOOKING_CANCELLED'
  | 'BOOKING_REFUNDED';

/** One row of the admin action audit trail. */
export interface AuditLogEntry {
  _id: string;
  adminId: string | Pick<User, '_id' | 'name' | 'email'>;
  action: AdminAction;
  targetType: 'TURF' | 'USER' | 'BOOKING';
  targetId: string;
  meta?: Record<string, unknown>;
  createdAt: string;
}

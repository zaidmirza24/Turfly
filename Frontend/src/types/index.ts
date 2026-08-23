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
  // Where an admin should send an OWNER's payout — see PayoutDetails below.
  // Only meaningful for role: OWNER, informational only (nothing moves money
  // to it automatically).
  payoutDetails?: PayoutDetails | null;
}

export interface PayoutDetails {
  method: 'UPI' | 'BANK';
  upiId?: string | null;
  bankAccountHolder?: string | null;
  bankAccountNumber?: string | null;
  bankIfsc?: string | null;
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
  // Set only on BOOKED slots: the linked Booking's groupId, or (for a 1hr
  // booking, which has no groupId) that booking's own id. Consecutive slots
  // sharing this value are the same customer's multi-hour reservation.
  reservationId?: string | null;
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
  // The list/detail endpoints (getUserBookings, getBookingsByTurf,
  // getOwnerBookings) collapse the per-hour Booking documents that share a
  // groupId into one logical reservation before returning them, so `_id`/
  // `amount` above are already the merged totals and these two carry the
  // full reservation's time range (a single 1hr booking still has both,
  // equal to its one slot's own startTime/endTime). `bookingIds` lists every
  // underlying per-hour Booking document making up the reservation.
  startTime?: string;
  endTime?: string;
  bookingIds?: string[];
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
  // Commission split (see Backend/src/modules/booking/booking.model.js) — set
  // only for ONLINE bookings once payment is confirmed. null for CASH/PENDING
  // bookings, which the platform never held money for.
  commissionAmount?: number | null;
  ownerAmount?: number | null;
  // NONE: n/a. PENDING: owed to the owner. PAID: settled (see payoutId).
  // VOID: refunded before payout — nothing owed either way. CLAWBACK_OWED:
  // refunded *after* the owner was already paid — they owe it back (no
  // automated recovery, admin reconciles manually).
  payoutStatus?: 'NONE' | 'PENDING' | 'PAID' | 'VOID' | 'CLAWBACK_OWED';
  payoutId?: string | null;
  paidOutAt?: string | null;
}

/** A settled owner payout — see Backend/src/modules/payout/payout.model.js. */
export interface Payout {
  _id: string;
  ownerId: string | Pick<User, '_id' | 'name' | 'email'>;
  bookingIds: string[];
  amount: number;
  method: 'UPI' | 'BANK_TRANSFER' | 'OTHER';
  note?: string | null;
  paidBy: string | Pick<User, '_id' | 'name' | 'email'>;
  createdAt: string;
}

/** One row of GET /api/admin/payouts/pending — one owner's payable balance. */
export interface PendingPayoutSummary {
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  payoutDetails?: PayoutDetails | null;
  pendingAmount: number;
  pendingCount: number;
  oldestPendingAt: string;
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

/**
 * A Payment stuck PAID with fewer bookings than slots it paid for — the
 * crash-window admin surface (GET /admin/payments/stuck). Real money was
 * captured; booking creation didn't finish.
 */
export interface StuckPayment {
  _id: string;
  status: 'PAID';
  userId: string;
  turfId: string;
  slotIds: string[];
  bookingIds: string[];
  amount: number;
  paidAt: string;
  groupId: string | null;
  razorpayPaymentId?: string | null;
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
  reservationMinutes: number;
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
  totalCommissionEarned: number;
  totalOwedToOwners: number;
  totalPaidToOwners: number;
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
  | 'BOOKING_REFUNDED'
  | 'BOOKING_PAID_OUT'
  | 'PAYMENT_RECONCILED';

/** One row of the admin action audit trail. */
export interface AuditLogEntry {
  _id: string;
  adminId: string | Pick<User, '_id' | 'name' | 'email'>;
  action: AdminAction;
  targetType: 'TURF' | 'USER' | 'BOOKING' | 'PAYMENT';
  targetId: string;
  meta?: Record<string, unknown>;
  createdAt: string;
}

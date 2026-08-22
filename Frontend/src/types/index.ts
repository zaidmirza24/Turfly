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
  // The owner's own bookkeeping note that they refunded this booking outside
  // the app — no payment gateway exists, so nothing here ever moves real
  // money. Only meaningful once status is CANCELLED.
  refundStatus?: 'NONE' | 'MARKED_REFUNDED';
  notes?: string | null;
  // Whether the customer self-booked, or an owner entered this on their
  // behalf from the panel (phone/walk-in booking).
  createdBy?: 'CUSTOMER' | 'OWNER';
  paymentMethod?: 'ONLINE' | 'CASH' | 'PENDING';
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

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

export interface User {
  _id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  avatar?: string;
  isBanned?: boolean;
  createdAt: string;
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
}

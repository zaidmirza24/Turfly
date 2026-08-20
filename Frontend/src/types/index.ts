export type Sport = 'football' | 'cricket' | 'badminton' | 'tennis' | 'basketball' | 'volleyball';

export type SlotStatus = 'available' | 'locked' | 'booked' | 'closed' | 'full';
export type BookingStatus = 'confirmed' | 'cancelled' | 'pending';
export type TurfApprovalStatus = 'approved' | 'pending' | 'rejected';
export type UserRole = 'USER' | 'OWNER' | 'ADMIN';

export interface User {
  _id: string;
  id?: string; // for backward compatibility
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
  id?: string;
  name: string;
  location: string;
  city?: string;
  description?: string;
  sportsType: string[]; // backend uses sportsType
  sport?: Sport[]; // frontend compatibility
  amenities: string[];
  pricePerHour?: number;
  rating?: number;
  reviewCount?: number;
  images?: string[];
  ownerId: string | { _id: string, name: string, email: string };
  isActive: boolean;
  approvalStatus?: 'PENDING' | 'APPROVED' | 'REJECTED';
  is24x7?: boolean;
  openHour?: number; // 0-23
  closeHour?: number; // 0-23, inclusive of the last slot's start hour
  defaultWeekdayPrice?: number;
  defaultWeekendPrice?: number;
}

export interface TimeSlot {
  _id: string;
  id?: string;
  turfId: string;
  date?: string; // YYYY-MM-DD (calculated from startTime if needed)
  startTime: string; // ISO String from backend
  endTime: string; // ISO String from backend
  status: 'AVAILABLE' | 'LOCKED' | 'BOOKED' | 'CLOSED' | 'FULL'; // match backend casing
  price: number;
}

export interface Booking {
  id: string;
  turfId: string;
  turfName: string;
  userId: string;
  slotId: string;
  date: string;
  startTime: string;
  endTime: string;
  amount: number;
  tax: number;
  totalAmount: number;
  status: BookingStatus;
  sport: Sport;
  createdAt: string;
}

export interface Review {
  id: string;
  turfId: string;
  userId: string;
  userName: string;
  rating: number;
  comment: string;
  createdAt: string;
}

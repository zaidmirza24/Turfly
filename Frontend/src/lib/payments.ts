import { apiGet, apiPost } from './api';
import { CheckoutOrder, Payment, TimeSlot, Booking } from '@/types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

/** Step 1 of real checkout: hold the slots without confirming a booking yet. */
export const lockSlotsForCheckout = (slotIds: string[]) =>
  apiPost<{ slotIds: string[]; turfId: string; lockedSlots: TimeSlot[] }>('/bookings/lock-multi', { slotIds });

/**
 * Short 1-minute hold applied the moment the customer opens the booking
 * summary screen — before they've committed to paying. lockSlotsForCheckout
 * (called from "Pay Now") extends this to the full payment hold rather than
 * re-racing for the slot, as long as it's called within that minute.
 */
export const holdSlotsForSummary = (slotIds: string[]) =>
  apiPost<{ slotIds: string[]; turfId: string; lockedSlots: TimeSlot[] }>('/bookings/hold-summary', { slotIds });

/**
 * Gives up a checkout hold early — payment popup dismissed, retry abandoned,
 * customer navigated away — instead of leaving the slot LOCKED until the
 * reservation TTL expires on its own. Best-effort: failures are swallowed by
 * every caller, since the worst case is just "the existing TTL still applies."
 */
export const releaseSlotsHold = (slotIds: string[]) =>
  apiPost<null>('/bookings/release', { slotIds }).catch(() => {});

/**
 * Same release call, but fired from a page-unload path (tab close, hard
 * navigation) where a normal axios request can get cancelled before it
 * leaves the browser. `fetch(..., { keepalive: true })` is the one request
 * shape browsers guarantee gets sent even as the page is torn down —
 * `navigator.sendBeacon` can't be used here instead because it can't carry
 * the Authorization header this endpoint requires.
 */
export const releaseSlotsHoldOnUnload = (slotIds: string[]) => {
  const token = localStorage.getItem('token');
  if (!token) return;
  try {
    fetch(`${API_BASE_URL}/bookings/release`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ slotIds }),
      keepalive: true,
    });
  } catch {
    // best-effort — the TTL is the fallback if this never lands
  }
};

/**
 * Step 2: create (or resume) a Razorpay order for those locked slots.
 * `groupId` is passed back in on a retry so the same order is reused instead
 * of a new one being created for every failed-payment retry / double click.
 */
export const createPaymentOrder = (slotIds: string[], groupId?: string) =>
  apiPost<CheckoutOrder>('/payments/create-order', { slotIds, groupId });

/**
 * Step 3: server-side verification of the Razorpay Checkout callback. This
 * is what actually confirms the booking — the callback itself is only a
 * signal to call this, never treated as proof of payment on its own.
 */
export const verifyPayment = (params: {
  paymentId: string;
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}) => apiPost<{ payment: Payment; bookings: Booking[]; bookingFailed?: boolean; deduped?: boolean }>('/payments/verify', params);

/** Polling fallback for "payment succeeded but the browser never got the callback." */
export const getPayment = (paymentId: string) => apiGet<Payment>(`/payments/${paymentId}`);

import { apiGet, apiPost } from './api';
import { CheckoutOrder, Payment, TimeSlot, Booking } from '@/types';

/** Step 1 of real checkout: hold the slots without confirming a booking yet. */
export const lockSlotsForCheckout = (slotIds: string[]) =>
  apiPost<{ slotIds: string[]; turfId: string; lockedSlots: TimeSlot[] }>('/bookings/lock-multi', { slotIds });

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

// Loads Razorpay's Checkout.js on demand — it's a third-party script, not a
// bundled dependency, per Razorpay's own integration model. Cached so a
// customer retrying payment (failed → retry) doesn't refetch it.
let loadPromise: Promise<void> | null = null;

export function loadRazorpayScript(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loadPromise = null;
      reject(new Error('Could not load the payment gateway — check your connection and try again'));
    };
    document.body.appendChild(script);
  });
  return loadPromise;
}

// Minimal typing for the subset of the Razorpay Checkout API this app uses —
// the SDK ships no types of its own.
export interface RazorpaySuccessResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description?: string;
  order_id: string;
  prefill?: { name?: string; email?: string; contact?: string };
  theme?: { color?: string };
  handler: (response: RazorpaySuccessResponse) => void;
  modal?: { ondismiss?: () => void };
}

/** Shape of the `payment.failed` event payload — bound via `.on()` below, per
 * Razorpay's documented pattern (the `handler` option only ever fires on
 * success, so a declined card/UPI is otherwise invisible to this app until
 * the webhook lands, seconds later). */
export interface RazorpayFailedError {
  code: string;
  description: string;
  source: string;
  step: string;
  reason: string;
  metadata?: { order_id?: string; payment_id?: string };
}

interface RazorpayInstance {
  open: () => void;
  on: (event: 'payment.failed', handler: (response: { error: RazorpayFailedError }) => void) => void;
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

export function openRazorpayCheckout(options: RazorpayOptions, onFailed?: (error: RazorpayFailedError) => void) {
  if (!window.Razorpay) throw new Error('Payment gateway did not load');
  const instance = new window.Razorpay(options);
  if (onFailed) {
    // Bound before .open() per Razorpay's own sample — this is purely a
    // same-session UX signal (a specific "card declined" vs. a generic
    // failure toast). It is never treated as authoritative: the webhook's
    // payment.failed handler (payment.service.js) is what actually updates
    // Payment.status, same as everywhere else in this integration.
    instance.on('payment.failed', (response) => onFailed(response.error));
  }
  instance.open();
}

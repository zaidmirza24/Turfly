import crypto from "crypto";

/**
 * Constant-time string comparison. A plain `===`/`!==` on a secret compared
 * against attacker-influenced input is a timing side-channel, however
 * small — how quickly the comparison fails leaks how many leading
 * characters were guessed correctly. Used for every shared-secret check in
 * this codebase (Razorpay signatures, the cron/Brevo webhook secrets).
 */
const safeEqual = (a, b) => {
  const bufA = Buffer.from(String(a ?? ""), "utf8");
  const bufB = Buffer.from(String(b ?? ""), "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
};

export default safeEqual;

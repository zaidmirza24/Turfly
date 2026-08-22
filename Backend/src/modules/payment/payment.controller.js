import * as paymentService from "./payment.service.js";
import Payment from "./payment.model.js";
import WebhookEvent from "./webhookEvent.model.js";
import { verifyWebhookSignature } from "./razorpay.client.js";
import { isRazorpayConfigured } from "../../common/config/env.js";
import env from "../../common/config/env.js";
import ApiResponse from "../../common/utils/ApiResponse.js";
import ApiError from "../../common/utils/ApiError.js";
import logger from "../../common/utils/logger.js";

const log = logger.child({ module: "payment.controller" });

export const createOrder = async (req, res) => {
  const result = await paymentService.createOrGetOrder(req.user, {
    slotIds: req.body.slotIds,
    groupId: req.body.groupId,
  });
  new ApiResponse(200, "Payment order created", result).send(res);
};

export const verify = async (req, res) => {
  const { paymentId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  const result = await paymentService.verifyAndFinalizePayment(req.user._id, {
    paymentId,
    razorpayOrderId: razorpay_order_id,
    razorpayPaymentId: razorpay_payment_id,
    razorpaySignature: razorpay_signature,
  });
  new ApiResponse(200, result.bookingFailed ? "Payment received but slot unavailable — refund initiated" : "Payment verified", result).send(res);
};

export const getPayment = async (req, res) => {
  const payment = await paymentService.getPaymentById(req.user, req.params.id);
  new ApiResponse(200, "Payment fetched", payment).send(res);
};

/**
 * Phase 8. Mounted with express.raw() ahead of the global JSON body parser
 * (see app.js) — `req.body` here is a Buffer, which is what the signature
 * check needs to run against Razorpay's exact bytes.
 */
export const webhook = async (req, res) => {
  if (!isRazorpayConfigured() || !env.RAZORPAY_WEBHOOK_SECRET) {
    log.error("Webhook received but Razorpay/webhook secret is not configured");
    return res.status(503).end();
  }

  const signature = req.headers["x-razorpay-signature"];
  const rawBody = req.body; // Buffer
  if (!verifyWebhookSignature(rawBody, signature)) {
    log.error("Invalid Razorpay webhook signature", { ip: req.ip });
    throw new ApiError(400, "INVALID_WEBHOOK_SIGNATURE");
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    throw new ApiError(400, "Malformed webhook payload");
  }

  const event = payload.event;
  const entity =
    payload.payload?.payment?.entity || payload.payload?.refund?.entity || payload.payload?.order?.entity;
  const entityId = entity?.id || "unknown";
  const dedupeKey = paymentService.buildDedupeKey(event, entityId);

  let eventRow;
  try {
    eventRow = await WebhookEvent.create({ dedupeKey, event, razorpayEventId: payload.id || null, raw: payload });
  } catch (err) {
    if (err.code === 11000) {
      // Already processed (or currently being processed by a concurrent
      // delivery) — Razorpay only needs a 200 to stop retrying.
      log.info("Duplicate webhook delivery ignored", { dedupeKey });
      return res.status(200).json({ received: true, duplicate: true });
    }
    throw err;
  }

  // Acknowledge fast (Phase 8): processing happens before the response only
  // because this deployment has no queue/worker to hand it to (see
  // ai-context.md's "recurring work without a scheduler" — the same
  // constraint applies here). Each handler branch is a single, fast DB
  // write plus at most one outbound email call, not a long-running job.
  try {
    await paymentService.handleWebhookEvent(event, payload);
  } catch (err) {
    log.error("Webhook processing failed — releasing dedupe claim for retry", { err, event, dedupeKey });
    // The WebhookEvent row only marks an event as *handled*; on a genuine
    // processing failure it must not permanently block a legitimate retry,
    // so the claim is released and Razorpay's automatic redelivery (it
    // retries on any non-2xx) will try again once the underlying issue is
    // fixed. A concurrent duplicate delivery arriving in the meantime still
    // can't double-process: it would insert its own row and run once, same
    // as this attempt just did.
    await WebhookEvent.deleteOne({ _id: eventRow._id }).catch(() => {});
    return res.status(500).json({ received: false });
  }

  res.status(200).json({ received: true });
};

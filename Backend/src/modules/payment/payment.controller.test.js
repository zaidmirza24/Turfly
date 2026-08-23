import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./payment.service.js", () => ({
  createOrGetOrder: vi.fn(),
  verifyAndFinalizePayment: vi.fn(),
  getPaymentById: vi.fn(),
  buildDedupeKey: (event, entityId) => `${event}:${entityId}`,
  handleWebhookEvent: vi.fn(),
}));
vi.mock("./payment.model.js", () => ({ default: {} }));
vi.mock("./webhookEvent.model.js", () => ({ default: { create: vi.fn(), deleteOne: vi.fn() } }));
vi.mock("./razorpay.client.js", () => ({ verifyWebhookSignature: vi.fn() }));
vi.mock("../../common/config/env.js", () => ({
  default: { RAZORPAY_WEBHOOK_SECRET: "whsec_test" },
  isRazorpayConfigured: vi.fn(() => true),
}));

const paymentService = await import("./payment.service.js");
const WebhookEvent = (await import("./webhookEvent.model.js")).default;
const { verifyWebhookSignature } = await import("./razorpay.client.js");
const { isRazorpayConfigured } = await import("../../common/config/env.js");
const { webhook } = await import("./payment.controller.js");

const fakeRes = () => {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.end = vi.fn().mockReturnValue(res);
  return res;
};

const capturedPayload = (event, entityId, extra = {}) => ({
  id: `evt_${entityId}`,
  event,
  payload: { payment: { entity: { id: entityId, order_id: `order_${entityId}`, ...extra } } },
});

describe("webhook controller (Section 4 — HTTP-level webhook handling)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isRazorpayConfigured.mockReturnValue(true);
  });

  it("TC-4.7 — rejects a webhook with an invalid signature before ever touching the dedupe store or the handler", async () => {
    verifyWebhookSignature.mockReturnValue(false);
    const payload = capturedPayload("payment.captured", "pay_1");
    const req = {
      headers: { "x-razorpay-signature": "forged" },
      body: Buffer.from(JSON.stringify(payload)),
      ip: "1.2.3.4",
    };
    const res = fakeRes();

    await expect(webhook(req, res)).rejects.toMatchObject({ statusCode: 400 });

    expect(WebhookEvent.create).not.toHaveBeenCalled();
    expect(paymentService.handleWebhookEvent).not.toHaveBeenCalled();
  });

  it("returns 503 without attempting signature verification when the webhook secret isn't configured", async () => {
    isRazorpayConfigured.mockReturnValue(false);
    const req = { headers: {}, body: Buffer.from("{}") };
    const res = fakeRes();

    await webhook(req, res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(verifyWebhookSignature).not.toHaveBeenCalled();
  });

  it("TC-4.1 — a valid, first-time webhook is dedupe-inserted then handed to the event handler and acknowledged 200", async () => {
    verifyWebhookSignature.mockReturnValue(true);
    WebhookEvent.create.mockResolvedValue({ _id: "evrow_1" });
    paymentService.handleWebhookEvent.mockResolvedValue(undefined);

    const payload = capturedPayload("payment.captured", "pay_1");
    const req = { headers: { "x-razorpay-signature": "sig" }, body: Buffer.from(JSON.stringify(payload)) };
    const res = fakeRes();

    await webhook(req, res);

    expect(WebhookEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ dedupeKey: "payment.captured:pay_1", event: "payment.captured" })
    );
    expect(paymentService.handleWebhookEvent).toHaveBeenCalledWith("payment.captured", payload);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ received: true });
  });

  it("TC-4.5 — a duplicate delivery of the same event (dedupeKey collision) is acknowledged 200 without reprocessing", async () => {
    verifyWebhookSignature.mockReturnValue(true);
    const dupErr = Object.assign(new Error("duplicate key"), { code: 11000 });
    WebhookEvent.create.mockRejectedValue(dupErr);

    const payload = capturedPayload("payment.captured", "pay_1");
    const req = { headers: { "x-razorpay-signature": "sig" }, body: Buffer.from(JSON.stringify(payload)) };
    const res = fakeRes();

    await webhook(req, res);

    expect(paymentService.handleWebhookEvent).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ received: true, duplicate: true }));
  });

  it("propagates a non-duplicate-key DB error from the dedupe insert instead of silently swallowing it", async () => {
    verifyWebhookSignature.mockReturnValue(true);
    WebhookEvent.create.mockRejectedValue(new Error("mongo is down"));

    const payload = capturedPayload("payment.captured", "pay_1");
    const req = { headers: { "x-razorpay-signature": "sig" }, body: Buffer.from(JSON.stringify(payload)) };
    const res = fakeRes();

    await expect(webhook(req, res)).rejects.toThrow("mongo is down");
    expect(paymentService.handleWebhookEvent).not.toHaveBeenCalled();
  });

  it("TC-4.9 — releases the dedupe claim and responds 500 when the handler throws, so Razorpay's retry can reprocess", async () => {
    verifyWebhookSignature.mockReturnValue(true);
    WebhookEvent.create.mockResolvedValue({ _id: "evrow_1" });
    paymentService.handleWebhookEvent.mockRejectedValue(new Error("transient DB write failure"));
    WebhookEvent.deleteOne.mockResolvedValue({});

    const payload = capturedPayload("payment.captured", "pay_1");
    const req = { headers: { "x-razorpay-signature": "sig" }, body: Buffer.from(JSON.stringify(payload)) };
    const res = fakeRes();

    await webhook(req, res);

    expect(WebhookEvent.deleteOne).toHaveBeenCalledWith({ _id: "evrow_1" });
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ received: false });
  });

  it("rejects a malformed (non-JSON) raw body after signature check, without crashing the process", async () => {
    verifyWebhookSignature.mockReturnValue(true);
    const req = { headers: { "x-razorpay-signature": "sig" }, body: Buffer.from("not json{{{") };
    const res = fakeRes();

    await expect(webhook(req, res)).rejects.toMatchObject({ statusCode: 400 });
    expect(WebhookEvent.create).not.toHaveBeenCalled();
  });

  it("TC-4.8 — an unrecognized entity id still gets a dedupeKey of 'unknown' rather than throwing before dedupe", async () => {
    verifyWebhookSignature.mockReturnValue(true);
    WebhookEvent.create.mockResolvedValue({ _id: "evrow_2" });
    paymentService.handleWebhookEvent.mockResolvedValue(undefined);

    const payload = { id: "evt_x", event: "payment.captured", payload: {} }; // no entity at all
    const req = { headers: { "x-razorpay-signature": "sig" }, body: Buffer.from(JSON.stringify(payload)) };
    const res = fakeRes();

    await webhook(req, res);

    expect(WebhookEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ dedupeKey: "payment.captured:unknown" })
    );
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import jwt from "jsonwebtoken";

vi.mock("../../modules/user/user.model.js", () => ({
  default: { findById: vi.fn() },
}));
vi.mock("../utils/logger.js", () => ({ addContext: vi.fn() }));
vi.mock("../config/env.js", () => ({ default: { JWT_SECRET: "test-secret" } }));

const { protect, authorize } = await import("./auth.js");
const User = (await import("../../modules/user/user.model.js")).default;

const mockReq = (headers = {}) => ({ headers });
const select = (user) => ({ select: vi.fn().mockResolvedValue(user) });

describe("protect", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects a request with no Authorization header", async () => {
    const next = vi.fn();
    await expect(protect(mockReq(), {}, next)).rejects.toMatchObject({
      statusCode: 401,
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects a header that isn't a Bearer token", async () => {
    const next = vi.fn();
    const req = mockReq({ authorization: "Basic abc123" });
    await expect(protect(req, {}, next)).rejects.toMatchObject({ statusCode: 401 });
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects a token signed with the wrong secret", async () => {
    const next = vi.fn();
    const forged = jwt.sign({ id: "u1" }, "wrong-secret");
    const req = mockReq({ authorization: `Bearer ${forged}` });
    await expect(protect(req, {}, next)).rejects.toThrow();
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects a valid token whose user no longer exists", async () => {
    const next = vi.fn();
    const token = jwt.sign({ id: "u1" }, "test-secret");
    User.findById.mockReturnValue(select(null));
    const req = mockReq({ authorization: `Bearer ${token}` });
    await expect(protect(req, {}, next)).rejects.toMatchObject({ statusCode: 401 });
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects a banned user's otherwise-valid token", async () => {
    const next = vi.fn();
    const token = jwt.sign({ id: "u1" }, "test-secret");
    User.findById.mockReturnValue(select({ _id: "u1", role: "USER", isBanned: true }));
    const req = mockReq({ authorization: `Bearer ${token}` });
    await expect(protect(req, {}, next)).rejects.toMatchObject({ statusCode: 403 });
    expect(next).not.toHaveBeenCalled();
  });

  it("attaches req.user and calls next for a valid token", async () => {
    const next = vi.fn();
    const token = jwt.sign({ id: "u1" }, "test-secret");
    const user = { _id: "u1", role: "USER", isBanned: false };
    User.findById.mockReturnValue(select(user));
    const req = mockReq({ authorization: `Bearer ${token}` });
    await protect(req, {}, next);
    expect(req.user).toBe(user);
    expect(next).toHaveBeenCalledOnce();
  });
});

describe("authorize", () => {
  it("calls next when the user's role is allowed", () => {
    const next = vi.fn();
    const req = { user: { role: "OWNER" } };
    authorize("OWNER", "ADMIN")(req, {}, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("throws 403 when the user's role is not allowed", () => {
    const next = vi.fn();
    const req = { user: { role: "USER" } };
    expect(() => authorize("OWNER", "ADMIN")(req, {}, next)).toThrow(
      expect.objectContaining({ statusCode: 403 })
    );
    expect(next).not.toHaveBeenCalled();
  });
});

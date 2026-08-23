import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../user/user.model.js", () => ({
  default: { findOne: vi.fn() },
}));
vi.mock("../../common/config/env.js", () => ({
  default: { JWT_SECRET: "test_secret", JWT_EXPIRES_IN: "7d", FRONTEND_URL: "http://localhost:5173" },
}));
vi.mock("../notification/email.service.js", () => ({
  sendPasswordReset: vi.fn().mockResolvedValue(null),
}));

const User = (await import("../user/user.model.js")).default;
const emailService = await import("../notification/email.service.js");
const { requestPasswordReset, resetPassword } = await import("./auth.service.js");

// requestPasswordReset must never let its caller distinguish "email exists"
// from "email doesn't exist" (auth.controller.js sends one generic response
// either way) — an observable difference here is a account-enumeration
// oracle. These tests assert both cases resolve identically (no throw, no
// return value) and that only the real-account case actually does anything.

describe("requestPasswordReset", () => {
  beforeEach(() => vi.clearAllMocks());

  it("silently no-ops for an email that doesn't exist — same outward behavior as a real one", async () => {
    User.findOne.mockResolvedValue(null);
    await expect(requestPasswordReset("nobody@example.com")).resolves.toBeUndefined();
    expect(emailService.sendPasswordReset).not.toHaveBeenCalled();
  });

  it("silently no-ops for a non-string email rather than letting it reach the query", async () => {
    await expect(requestPasswordReset({ $ne: null })).resolves.toBeUndefined();
    expect(User.findOne).not.toHaveBeenCalled();
  });

  it("generates and stores a hashed token (never the raw one) and emails a reset link for a real account", async () => {
    const user = {
      _id: "u1",
      name: "Zaid",
      email: "zaid@example.com",
      save: vi.fn().mockResolvedValue(true),
    };
    User.findOne.mockResolvedValue(user);

    await requestPasswordReset("zaid@example.com");

    expect(user.resetPasswordTokenHash).toBeTruthy();
    expect(user.resetPasswordTokenHash).toHaveLength(64); // sha256 hex digest
    expect(user.resetPasswordExpires).toBeInstanceOf(Date);
    expect(user.resetPasswordExpires.getTime()).toBeGreaterThan(Date.now());
    expect(user.save).toHaveBeenCalled();

    expect(emailService.sendPasswordReset).toHaveBeenCalledTimes(1);
    const [emailedUser, resetUrl] = emailService.sendPasswordReset.mock.calls[0];
    expect(emailedUser).toBe(user);
    expect(resetUrl).toContain("http://localhost:5173/reset-password?token=");
    expect(resetUrl).toContain("email=zaid%40example.com");
    // The raw token in the URL must not equal the stored hash — otherwise
    // the stored value would itself be a usable token if the DB ever leaked.
    const rawToken = new URL(resetUrl).searchParams.get("token");
    expect(rawToken).not.toBe(user.resetPasswordTokenHash);
  });

  it("never sends a reset link to a deleted or guest account", async () => {
    User.findOne.mockResolvedValue(null); // the query itself excludes isDeleted/isGuest
    await requestPasswordReset("deleted@example.com");
    expect(User.findOne).toHaveBeenCalledWith({
      email: "deleted@example.com",
      isDeleted: false,
      isGuest: false,
    });
    expect(emailService.sendPasswordReset).not.toHaveBeenCalled();
  });
});

describe("resetPassword", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects a missing/short new password before touching the DB", async () => {
    await expect(
      resetPassword({ email: "a@b.com", token: "tok", newPassword: "123" })
    ).rejects.toThrow(/at least 6 characters/);
    expect(User.findOne).not.toHaveBeenCalled();
  });

  it("rejects an unknown or expired token with a generic error", async () => {
    const select = vi.fn().mockResolvedValue(null);
    User.findOne.mockReturnValue({ select });

    await expect(
      resetPassword({ email: "a@b.com", token: "bad-token", newPassword: "newpass123" })
    ).rejects.toThrow(/Invalid or expired reset link/);
  });

  it("spends the token: sets the new password and clears the reset fields so the token can't be reused", async () => {
    const user = {
      password: "old-hash",
      resetPasswordTokenHash: "some-hash",
      resetPasswordExpires: new Date(Date.now() + 60000),
      save: vi.fn().mockResolvedValue(true),
    };
    const select = vi.fn().mockResolvedValue(user);
    User.findOne.mockReturnValue({ select });

    await resetPassword({ email: "a@b.com", token: "good-token", newPassword: "newpass123" });

    expect(user.password).toBe("newpass123"); // re-hashed by the model's own pre-save hook, not here
    expect(user.resetPasswordTokenHash).toBeNull();
    expect(user.resetPasswordExpires).toBeNull();
    expect(user.save).toHaveBeenCalled();
  });
});

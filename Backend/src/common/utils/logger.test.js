import { describe, it, expect } from "vitest";
import { sanitize } from "./logger.js";

describe("log redaction", () => {
  it("removes credentials", () => {
    const out = sanitize({ email: "a@b.com", password: "hunter2", token: "abc.def.ghi" });
    expect(out.password).toBe("[redacted]");
    expect(out.token).toBe("[redacted]");
    expect(JSON.stringify(out)).not.toContain("hunter2");
  });

  it("removes personal data", () => {
    // Logs get shipped to third-party aggregators; a customer's contact
    // details have no business being replicated there.
    const out = sanitize({ name: "Aisha Khan", email: "aisha@example.com", phone: "9876543210" });
    expect(out.name).toBe("[redacted]");
    expect(out.email).toBe("[redacted]");
    expect(out.phone).toBe("[redacted]");
  });

  it("redacts nested keys, whatever their casing", () => {
    const out = sanitize({ body: { user: { Password: "x", JWT: "y", id: "keep-me" } } });
    expect(out.body.user.Password).toBe("[redacted]");
    expect(out.body.user.JWT).toBe("[redacted]");
    expect(out.body.user.id).toBe("keep-me");
  });

  it("strips credentials out of a connection string in free text", () => {
    // This is the shape that leaks by accident: it arrives inside a driver
    // error message, where no key name is protecting it.
    const out = sanitize("failed to connect to mongodb+srv://admin:s3cret@cluster0.mongodb.net/turf");
    expect(out).not.toContain("s3cret");
    expect(out).toContain("<credentials>@");
  });

  it("strips bearer tokens and bare JWTs from free text", () => {
    const jwt = "eyJhbGciOi.eyJzdWIiOjEyMw.SflKxwRJSM";
    expect(sanitize(`Authorization: Bearer ${jwt}`)).not.toContain(jwt);
    expect(sanitize(`token was ${jwt} apparently`)).toContain("<jwt>");
  });

  it("keeps an error's identity and stack", () => {
    const err = new Error("boom");
    const out = sanitize({ err });
    expect(out.err.name).toBe("Error");
    expect(out.err.message).toBe("boom");
    expect(out.err.stack).toContain("Error: boom");
  });

  it("summarises buffers instead of dumping binary", () => {
    expect(sanitize({ file: Buffer.alloc(2048) }).file).toBe("[buffer 2048 bytes]");
  });

  it("truncates very long strings", () => {
    const out = sanitize("x".repeat(5000));
    expect(out.length).toBeLessThan(2100);
    expect(out).toContain("[truncated]");
  });

  it("caps recursion depth rather than following a deep object forever", () => {
    let deep = { value: "bottom" };
    for (let i = 0; i < 12; i++) deep = { nested: deep };
    expect(JSON.stringify(sanitize(deep))).toContain("[max depth]");
  });

  it("survives a circular reference", () => {
    // Depth capping is what saves us here — a naive walk would recurse forever
    // and take the process down with it.
    const a = { label: "a" };
    a.self = a;
    expect(() => sanitize(a)).not.toThrow();
  });
});

import { describe, it, expect } from "vitest";
import { toPaise, toRupees } from "./money.js";

describe("toPaise/toRupees", () => {
  it("round-trips whole rupees exactly", () => {
    expect(toPaise(500)).toBe(50000);
    expect(toRupees(50000)).toBe(500);
  });

  it("round-trips fractional rupees exactly", () => {
    expect(toPaise(499.99)).toBe(49999);
    expect(toRupees(49999)).toBe(499.99);
    expect(toPaise(0.5)).toBe(50);
    expect(toRupees(50)).toBe(0.5);
    expect(toPaise(0.01)).toBe(1);
    expect(toRupees(1)).toBe(0.01);
  });

  it("always returns an integer from toPaise", () => {
    for (let rupees = 0; rupees <= 10; rupees += 0.01) {
      expect(Number.isInteger(toPaise(rupees))).toBe(true);
    }
  });
});

import { describe, it, expect } from "vitest";
import { isWithinOperatingHours, hourlyRateToSlotPricePaise } from "./slot.service.js";
import { istDateTime } from "../../common/utils/istTime.js";

const turf = (overrides = {}) => ({ is24x7: false, openHour: 6, closeHour: 22, ...overrides });

describe("isWithinOperatingHours", () => {
  it("allows any hour for a 24x7 turf regardless of openHour/closeHour", () => {
    const t = turf({ is24x7: true, openHour: 9, closeHour: 17 });
    const start = istDateTime("2026-08-21", 2);
    const end = istDateTime("2026-08-21", 3);
    expect(isWithinOperatingHours(t, start, end)).toBe(true);
  });

  it("allows a slot fully inside the operating window", () => {
    const t = turf();
    const start = istDateTime("2026-08-21", 9);
    const end = istDateTime("2026-08-21", 10);
    expect(isWithinOperatingHours(t, start, end)).toBe(true);
  });

  it("allows a slot starting exactly at openHour", () => {
    const t = turf();
    const start = istDateTime("2026-08-21", 6);
    const end = istDateTime("2026-08-21", 7);
    expect(isWithinOperatingHours(t, start, end)).toBe(true);
  });

  it("allows a slot starting exactly at closeHour (the last bookable hour of the day)", () => {
    const t = turf();
    const start = istDateTime("2026-08-21", 22);
    const end = istDateTime("2026-08-21", 23);
    expect(isWithinOperatingHours(t, start, end)).toBe(true);
  });

  it("rejects a slot starting before openHour", () => {
    const t = turf();
    const start = istDateTime("2026-08-21", 3);
    const end = istDateTime("2026-08-21", 4);
    expect(isWithinOperatingHours(t, start, end)).toBe(false);
  });

  it("rejects a slot starting after closeHour", () => {
    const t = turf();
    const start = istDateTime("2026-08-21", 23);
    const end = istDateTime("2026-08-22", 0);
    expect(isWithinOperatingHours(t, start, end)).toBe(false);
  });

  it("treats a missing is24x7 flag on an owner-configured turf as bounded, not open", () => {
    const t = { is24x7: false, openHour: 6, closeHour: 22 };
    const start = istDateTime("2026-08-21", 1);
    const end = istDateTime("2026-08-21", 2);
    expect(isWithinOperatingHours(t, start, end)).toBe(false);
  });
});

/**
 * A slot is half an hour; every price an owner enters is a per-hour rate.
 * `updateSlots` and `setSlotsStatus` both used to write the hourly figure
 * straight onto a slot, so any owner price edit doubled what customers were
 * actually charged — and nothing failed, because both numbers are just
 * integers of paise. These pin the conversion so a future caller can't
 * quietly reintroduce it.
 */
describe("hourlyRateToSlotPricePaise", () => {
  it("halves an hourly rate into the price of one half-hour slot", () => {
    expect(hourlyRateToSlotPricePaise(120000)).toBe(60000); // ₹1200/hr → ₹600/slot
  });

  it("keeps two slots summing back to exactly one hour's rate", () => {
    const hourly = 150000; // ₹1500/hr
    expect(hourlyRateToSlotPricePaise(hourly) * 2).toBe(hourly);
  });

  it("returns whole paise for an odd rate rather than a fractional amount", () => {
    const slotPrice = hourlyRateToSlotPricePaise(99999);
    expect(Number.isInteger(slotPrice)).toBe(true);
    expect(slotPrice).toBe(50000);
  });

  it("never returns the hourly rate itself — the exact bug this guards", () => {
    const hourly = 120000;
    expect(hourlyRateToSlotPricePaise(hourly)).not.toBe(hourly);
  });

  it("handles a free slot", () => {
    expect(hourlyRateToSlotPricePaise(0)).toBe(0);
  });
});

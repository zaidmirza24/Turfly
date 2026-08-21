import { describe, it, expect } from "vitest";
import { isWithinOperatingHours } from "./slot.service.js";
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

import { describe, it, expect } from "vitest";
import {
  istDateTime,
  istDayBounds,
  istDateKey,
  istRangeFilter,
  nextDateKey,
  previousDateKey,
} from "./istTime.js";

// IST is UTC+5:30, so every IST calendar day starts at 18:30 UTC the previous
// day. That offset is the whole reason this module exists: anything that
// reaches for `new Date("YYYY-MM-DD")` or `.toISOString().slice(0, 10)` gets
// the UTC day instead, which is a *different day* for the first 5½ hours of
// every IST one.

describe("istDateKey", () => {
  it("returns the IST day, not the UTC day, for an early-morning IST instant", () => {
    // 00:30 IST on 24 Aug is still 19:00 UTC on 23 Aug.
    const instant = new Date("2026-08-23T19:00:00.000Z");
    expect(istDateKey(instant)).toBe("2026-08-24");
    expect(instant.toISOString().slice(0, 10)).toBe("2026-08-23"); // the old, wrong answer
  });

  it("returns the IST day for a late-evening IST instant", () => {
    // 23:30 IST on 24 Aug is 18:00 UTC the same day.
    expect(istDateKey(new Date("2026-08-24T18:00:00.000Z"))).toBe("2026-08-24");
  });

  it("rolls over exactly at IST midnight", () => {
    expect(istDateKey(new Date("2026-08-23T18:29:59.999Z"))).toBe("2026-08-23");
    expect(istDateKey(new Date("2026-08-23T18:30:00.000Z"))).toBe("2026-08-24");
  });
});

describe("previousDateKey / nextDateKey", () => {
  it("steps back a day", () => {
    expect(previousDateKey("2026-08-24")).toBe("2026-08-23");
  });

  it("steps back across a month boundary", () => {
    expect(previousDateKey("2026-08-01")).toBe("2026-07-31");
  });

  it("steps back across a year boundary", () => {
    expect(previousDateKey("2026-01-01")).toBe("2025-12-31");
  });

  it("handles a leap day", () => {
    expect(previousDateKey("2028-03-01")).toBe("2028-02-29");
    expect(nextDateKey("2028-02-29")).toBe("2028-03-01");
  });

  it("round-trips with nextDateKey", () => {
    expect(nextDateKey(previousDateKey("2026-08-24"))).toBe("2026-08-24");
  });
});

describe("istRangeFilter", () => {
  it("returns null when neither bound is given", () => {
    expect(istRangeFilter(undefined, undefined)).toBeNull();
    expect(istRangeFilter("", "")).toBeNull();
  });

  it("covers the whole IST day when from and to are the same date key", () => {
    // The "show me today" case that used to silently drop its own morning.
    const range = istRangeFilter("2026-08-24", "2026-08-24");
    expect(range.$gte).toEqual(istDayBounds("2026-08-24").start);
    expect(range.$lte).toEqual(istDayBounds("2026-08-24").end);

    // A 06:00 IST slot — before the UTC day even begins — must fall inside it.
    const earlySlot = istDateTime("2026-08-24", 6);
    expect(earlySlot >= range.$gte).toBe(true);
    expect(earlySlot <= range.$lte).toBe(true);

    // And a 23:30 IST slot, which the UTC day would have pushed into tomorrow.
    const lateSlot = istDateTime("2026-08-24", 23, 30);
    expect(lateSlot >= range.$gte).toBe(true);
    expect(lateSlot <= range.$lte).toBe(true);
  });

  it("excludes the neighbouring days", () => {
    const range = istRangeFilter("2026-08-24", "2026-08-24");
    expect(istDateTime("2026-08-23", 23, 30) >= range.$gte).toBe(false);
    expect(istDateTime("2026-08-25", 0, 0) <= range.$lte).toBe(false);
  });

  it("accepts an open-ended range", () => {
    expect(istRangeFilter("2026-08-24", undefined)).toEqual({
      $gte: istDayBounds("2026-08-24").start,
    });
    expect(istRangeFilter(undefined, "2026-08-24")).toEqual({
      $lte: istDayBounds("2026-08-24").end,
    });
  });

  it("passes a full ISO instant through untouched rather than snapping it to a day", () => {
    const range = istRangeFilter("2026-08-24T10:15:00.000Z", "2026-08-24T12:45:00.000Z");
    expect(range.$gte).toEqual(new Date("2026-08-24T10:15:00.000Z"));
    expect(range.$lte).toEqual(new Date("2026-08-24T12:45:00.000Z"));
  });
});

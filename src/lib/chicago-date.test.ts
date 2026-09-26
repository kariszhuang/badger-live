import { describe, expect, it } from "vitest";
import { chicagoDate, eventStatus, formatEventTime, isValidDate, shiftDate } from "./chicago-date";

describe("Chicago calendar rules", () => {
  it("uses Chicago date across UTC midnight", () => {
    expect(chicagoDate(new Date("2026-09-27T03:00:00Z"))).toBe("2026-09-26");
  });
  it("rejects impossible dates and shifts through leap day", () => {
    expect(isValidDate("2026-02-30")).toBe(false);
    expect(isValidDate("2028-02-29")).toBe(true);
    expect(shiftDate("2028-02-28", 1)).toBe("2028-02-29");
  });
  it("formats fall daylight saving transition in Chicago", () => {
    expect(formatEventTime("2026-11-01T06:30:00Z")).toBe("1:30 AM");
    expect(formatEventTime("2026-11-01T08:30:00Z")).toBe("2:30 AM");
  });
  it("does not assign live status to another selected day", () => {
    expect(eventStatus("2026-09-26T15:00:00Z", undefined, "2026-09-25", new Date("2026-09-26T14:00:00Z"))).toBeNull();
  });
});

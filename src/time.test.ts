import { describe, expect, it } from "vitest";

import { getCounterSnapshot, validateCounterSchedule } from "./time";
import type { CounterSchedule } from "./types";

const defaultSchedule: CounterSchedule = {
  start: "08:00",
  lunchStart: "12:00",
  lunchEnd: "13:00",
  end: "17:00",
};

function seconds(time: string) {
  const [hours, minutes] = time.split(":").map(Number);

  return hours * 3600 + minutes * 60;
}

describe("getCounterSnapshot", () => {
  it("tracks a daytime routine with a break", () => {
    expect(getCounterSnapshot(defaultSchedule, seconds("07:30"))).toMatchObject({
      state: "before",
      remaining: 30 * 60,
      next: "08:00",
    });

    expect(getCounterSnapshot(defaultSchedule, seconds("12:30"))).toMatchObject({
      state: "lunch",
      remaining: 30 * 60,
      next: "13:00",
    });
  });

  it("supports routines that cross midnight", () => {
    const schedule: CounterSchedule = {
      start: "22:00",
      lunchStart: "01:00",
      lunchEnd: "01:30",
      end: "06:00",
    };

    expect(getCounterSnapshot(schedule, seconds("00:30"))).toMatchObject({
      state: "work",
      label: "PAUSA EM",
      remaining: 30 * 60,
      next: "01:00",
    });

    expect(getCounterSnapshot(schedule, seconds("01:15"))).toMatchObject({
      state: "lunch",
      remaining: 15 * 60,
      next: "01:30",
    });
  });

  it("supports routines without a break", () => {
    expect(getCounterSnapshot(defaultSchedule, seconds("10:00"), false)).toMatchObject({
      state: "work",
      label: "ROTINA ENCERRA EM",
      remaining: 7 * 60 * 60,
      next: "17:00",
    });
  });
});

describe("validateCounterSchedule", () => {
  it("accepts overnight routines with a valid break", () => {
    expect(
      validateCounterSchedule(
        {
          start: "22:00",
          lunchStart: "01:00",
          lunchEnd: "01:30",
          end: "06:00",
        },
        true,
      ).valid,
    ).toBe(true);
  });

  it("rejects malformed and accidental multi-day routines", () => {
    expect(validateCounterSchedule({ ...defaultSchedule, start: "99:99" }).valid).toBe(false);

    expect(
      validateCounterSchedule({
        start: "22:00",
        lunchStart: "21:00",
        lunchEnd: "22:30",
        end: "23:00",
      }).valid,
    ).toBe(false);
  });
});

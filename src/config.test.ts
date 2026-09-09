import { describe, expect, it } from "vitest";

import { defaultConfig, normalizeConfig } from "./config";

describe("normalizeConfig", () => {
  it("fills missing profile and routine fields from defaults", () => {
    const config = normalizeConfig({
      applications: [],
      counterTime: {
        enabled: true,
        notifications: {
          messages: {
            start: {
              title: "COMEÇOU",
            },
          },
        },
      },
    });

    expect(config.profile).toEqual(defaultConfig.profile);
    expect(config.counterTime.breakEnabled).toBe(true);
    expect(config.counterTime.notifications.messages.start).toEqual({
      title: "COMEÇOU",
      message: defaultConfig.counterTime.notifications.messages.start.message,
    });
    expect(config.counterTime.notifications.messages.end).toEqual(
      defaultConfig.counterTime.notifications.messages.end,
    );
  });

  it("rejects malformed nested values without crashing", () => {
    const config = normalizeConfig({
      applications: [
        {
          name: "Valid",
          executable: "valid.exe",
          path: "C:\\Apps\\valid.exe",
          icon: null,
        },
        {
          name: "Broken",
          executable: "broken.exe",
          path: 42,
          icon: null,
        },
      ],
      browser: "not an object",
      counterTime: {
        breakEnabled: false,
        notifications: {
          duration: 999,
          sound: "yes",
        },
        schedule: {
          start: "99:99",
          end: "22:30",
        },
      },
    } as never);

    expect(config.applications).toHaveLength(1);
    expect(config.browser).toEqual(defaultConfig.browser);
    expect(config.counterTime.breakEnabled).toBe(false);
    expect(config.counterTime.notifications.duration).toBe(30);
    expect(config.counterTime.notifications.sound).toBe(true);
    expect(config.counterTime.schedule.start).toBe(defaultConfig.counterTime.schedule.start);
    expect(config.counterTime.schedule.end).toBe("22:30");
  });
});

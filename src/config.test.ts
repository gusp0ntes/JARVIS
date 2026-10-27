import { describe, expect, it } from "vitest";

import { defaultConfig, normalizeConfig } from "./config";

describe("normalizeConfig", () => {
  it("migrates an existing browser URL without losing the configured page", () => {
    const config = normalizeConfig({ browser: { url: " https://exemplo.com/inicio " } });

    expect(config.browser.urls).toEqual(["https://exemplo.com/inicio"]);
    expect(normalizeConfig(config).browser.urls).toEqual(config.browser.urls);
  });

  it("keeps browser tabs in order across saves and ignores empty or malformed entries", () => {
    const config = normalizeConfig({
      browser: {
        urls: [" https://exemplo.com ", "", null, 42, "https://outro.com/pagina"],
      },
    } as never);

    expect(config.browser.urls).toEqual(["https://exemplo.com", "https://outro.com/pagina"]);
    expect(normalizeConfig(JSON.parse(JSON.stringify(config))).browser.urls)
      .toEqual(config.browser.urls);
  });

  it("does not restore a removed legacy URL when the tab list is empty", () => {
    expect(normalizeConfig({ browser: { urls: [], url: "https://antigo.com" } }).browser.urls)
      .toEqual([]);
  });

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
    expect(config.appearance).toEqual(defaultConfig.appearance);
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

  it("normalizes appearance values", () => {
    const config = normalizeConfig({
      applications: [],
      appearance: {
        mode: "gradient",
        primaryColor: "#22D3EE",
        secondaryColor: "#0EA5E9",
      },
    });

    expect(config.appearance).toEqual({
      mode: "gradient",
      primaryColor: "#22d3ee",
      secondaryColor: "#0ea5e9",
    });
  });

  it("rejects malformed appearance values", () => {
    const config = normalizeConfig({
      applications: [],
      appearance: {
        mode: "rainbow",
        primaryColor: "blue",
        secondaryColor: "#123",
      },
    } as never);

    expect(config.appearance).toEqual(defaultConfig.appearance);
  });
});

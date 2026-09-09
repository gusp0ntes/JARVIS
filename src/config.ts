import type { Application, JarvisConfig } from "./types";

type DeepPartial<T> = {
  [Key in keyof T]?: T[Key] extends object ? DeepPartial<T[Key]> : T[Key];
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown, fallback = "", maxLength = 300) {
  return typeof value === "string" ? value.slice(0, maxLength) : fallback;
}

function readBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function readDuration(value: unknown, fallback = 5) {
  const duration = Number(value);

  if (!Number.isFinite(duration)) {
    return fallback;
  }

  return Math.max(2, Math.min(Math.round(duration), 30));
}

function readTimeString(value: unknown, fallback: string) {
  const time = readString(value, fallback, 5);

  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : fallback;
}

function readNotificationMessage(
  value: unknown,
  fallback: { title: string; message: string },
) {
  const safeValue = isPlainObject(value) ? value : {};

  return {
    title: readString(safeValue.title, fallback.title, 80),
    message: readString(safeValue.message, fallback.message, 240),
  };
}

export const defaultConfig: JarvisConfig = {
  profile: {
    name: "Meu perfil",
    description: "Ambiente personalizado",
  },
  applications: [],
  browser: {
    enabled: false,
    name: "",
    path: "",
    url: "",
  },
  vpn: {
    enabled: false,
    name: "",
  },
  counterTime: {
    enabled: false,
    breakEnabled: true,
    schedule: {
      start: "08:00",
      lunchStart: "12:00",
      lunchEnd: "13:00",
      end: "17:00",
    },
    notifications: {
      enabled: true,
      sound: true,
      duration: 5,
      messages: {
        start: {
          title: "ROTINA INICIADA",
          message: "Sua rotina começou.",
        },
        lunchStart: {
          title: "HORA DA PAUSA",
          message: "Seu intervalo começou.",
        },
        lunchEnd: {
          title: "RETORNO DA PAUSA",
          message: "Seu intervalo terminou.",
        },
        end: {
          title: "ROTINA ENCERRADA",
          message: "A rotina configurada terminou.",
        },
      },
    },
  },
};

export function cloneDefaultConfig(): JarvisConfig {
  return structuredClone(defaultConfig);
}

type ConfigInput = DeepPartial<Omit<JarvisConfig, "applications">> & {
  applications?: Application[];
};

export function normalizeConfig(saved: ConfigInput | null | undefined): JarvisConfig {
  const safeSaved = isPlainObject(saved) ? saved : {};
  const profile = isPlainObject(safeSaved.profile) ? safeSaved.profile : {};
  const browser = isPlainObject(safeSaved.browser) ? safeSaved.browser : {};
  const vpn = isPlainObject(safeSaved.vpn) ? safeSaved.vpn : {};
  const counterTime = isPlainObject(safeSaved.counterTime) ? safeSaved.counterTime : {};
  const schedule = isPlainObject(counterTime.schedule) ? counterTime.schedule : {};
  const notifications = isPlainObject(counterTime.notifications)
    ? counterTime.notifications
    : {};
  const messages = isPlainObject(notifications.messages) ? notifications.messages : {};

  return {
    profile: {
      name: readString(profile.name, defaultConfig.profile.name, 80),
      description: readString(
        profile.description,
        defaultConfig.profile.description,
        160,
      ),
    },
    applications: Array.isArray(safeSaved.applications)
      ? safeSaved.applications.filter(isApplication)
      : [],
    browser: {
      enabled: readBoolean(browser.enabled, defaultConfig.browser.enabled),
      name: readString(browser.name, defaultConfig.browser.name, 120),
      path: readString(browser.path, defaultConfig.browser.path, 1000),
      url: readString(browser.url, defaultConfig.browser.url, 2048),
    },
    vpn: {
      enabled: readBoolean(vpn.enabled, defaultConfig.vpn.enabled),
      name: readString(vpn.name, defaultConfig.vpn.name, 120).trim(),
    },
    counterTime: {
      enabled: readBoolean(counterTime.enabled, defaultConfig.counterTime.enabled),
      breakEnabled:
        typeof counterTime.breakEnabled === "boolean"
          ? counterTime.breakEnabled
          : defaultConfig.counterTime.breakEnabled,
      schedule: {
        start: readTimeString(schedule.start, defaultConfig.counterTime.schedule.start),
        lunchStart: readTimeString(
          schedule.lunchStart,
          defaultConfig.counterTime.schedule.lunchStart,
        ),
        lunchEnd: readTimeString(
          schedule.lunchEnd,
          defaultConfig.counterTime.schedule.lunchEnd,
        ),
        end: readTimeString(schedule.end, defaultConfig.counterTime.schedule.end),
      },
      notifications: {
        enabled: readBoolean(
          notifications.enabled,
          defaultConfig.counterTime.notifications.enabled,
        ),
        sound: readBoolean(notifications.sound, defaultConfig.counterTime.notifications.sound),
        duration: readDuration(
          notifications.duration,
          defaultConfig.counterTime.notifications.duration,
        ),
        messages: {
          start: readNotificationMessage(
            messages.start,
            defaultConfig.counterTime.notifications.messages.start,
          ),
          lunchStart: readNotificationMessage(
            messages.lunchStart,
            defaultConfig.counterTime.notifications.messages.lunchStart,
          ),
          lunchEnd: readNotificationMessage(
            messages.lunchEnd,
            defaultConfig.counterTime.notifications.messages.lunchEnd,
          ),
          end: readNotificationMessage(
            messages.end,
            defaultConfig.counterTime.notifications.messages.end,
          ),
        },
      },
    },
  };
}

function isApplication(value: unknown): value is Application {
  return (
    isPlainObject(value) &&
    typeof value.name === "string" &&
    typeof value.executable === "string" &&
    typeof value.path === "string" &&
    (typeof value.icon === "string" || value.icon === null)
  );
}

import type { CounterSchedule } from "./types";

const DAY_SECONDS = 24 * 60 * 60;

export interface CounterSnapshot {
  state: "before" | "work" | "lunch" | "finished";
  label: string;
  remaining: number;
  progress: number;
  next: string;
}

export interface ScheduleValidation {
  valid: boolean;
  message: string;
}

export function secondsFromTime(time: string) {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);

  return hours * 3600 + minutes * 60;
}

export function isTimeString(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function getCurrentSeconds() {
  const now = new Date();

  return now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
}

export function formatDuration(totalSeconds: number) {
  const safeTotalSeconds = Math.max(0, totalSeconds);
  const hours = Math.floor(safeTotalSeconds / 3600);
  const minutes = Math.floor((safeTotalSeconds % 3600) / 60);
  const seconds = safeTotalSeconds % 60;

  return [
    String(hours).padStart(2, "0"),
    String(minutes).padStart(2, "0"),
    String(seconds).padStart(2, "0"),
  ].join(":");
}

export function getCounterSnapshot(
  schedule: CounterSchedule,
  currentSeconds: number,
  breakEnabled = true,
): CounterSnapshot {
  const start = secondsFromTime(schedule.start);
  const lunchStart = normalizeAfter(secondsFromTime(schedule.lunchStart), start);
  const lunchEnd = normalizeAfter(secondsFromTime(schedule.lunchEnd), lunchStart);
  const end = normalizeAfter(
    secondsFromTime(schedule.end),
    breakEnabled ? lunchEnd : start,
  );
  const now = normalizeCurrentSeconds(currentSeconds, start, end);

  if (now < start) {
    return {
      state: "before",
      label: "ROTINA COMEÇA EM",
      remaining: start - now,
      progress: 0,
      next: schedule.start,
    };
  }

  if (breakEnabled && now >= start && now < lunchStart) {
    return {
      state: "work",
      label: "PAUSA EM",
      remaining: lunchStart - now,
      progress: getProgress(now - start, lunchStart - start),
      next: schedule.lunchStart,
    };
  }

  if (breakEnabled && now >= lunchStart && now < lunchEnd) {
    return {
      state: "lunch",
      label: "RETORNO EM",
      remaining: lunchEnd - now,
      progress: getProgress(now - lunchStart, lunchEnd - lunchStart),
      next: schedule.lunchEnd,
    };
  }

  const workStart = breakEnabled ? lunchEnd : start;

  if (now >= workStart && now < end) {
    return {
      state: "work",
      label: "ROTINA ENCERRA EM",
      remaining: end - now,
      progress: getProgress(now - workStart, end - workStart),
      next: schedule.end,
    };
  }

  return {
    state: "finished",
    label: "ROTINA ENCERRADA",
    remaining: start + DAY_SECONDS - now,
    progress: 100,
    next: schedule.start,
  };
}

export function validateCounterSchedule(
  schedule: CounterSchedule,
  breakEnabled = true,
): ScheduleValidation {
  const requiredTimes = breakEnabled
    ? [schedule.start, schedule.lunchStart, schedule.lunchEnd, schedule.end]
    : [schedule.start, schedule.end];

  if (requiredTimes.some((time) => !isTimeString(time))) {
    return {
      valid: false,
      message: "Preencha os horários da rotina no formato correto.",
    };
  }

  const start = secondsFromTime(schedule.start);
  const end = normalizeAfter(secondsFromTime(schedule.end), start);

  if (end - start < 60) {
    return {
      valid: false,
      message: "A rotina precisa durar pelo menos 1 minuto.",
    };
  }

  if (end - start > DAY_SECONDS) {
    return {
      valid: false,
      message: "A rotina não pode passar de 24 horas.",
    };
  }

  if (!breakEnabled) {
    return {
      valid: true,
      message: "",
    };
  }

  const lunchStart = normalizeAfter(secondsFromTime(schedule.lunchStart), start);
  const lunchEnd = normalizeAfter(secondsFromTime(schedule.lunchEnd), lunchStart);
  const normalizedEnd = normalizeAfter(secondsFromTime(schedule.end), lunchEnd);

  if (normalizedEnd - start > DAY_SECONDS) {
    return {
      valid: false,
      message: "A rotina não pode passar de 24 horas.",
    };
  }

  if (lunchStart >= normalizedEnd || lunchEnd > normalizedEnd) {
    return {
      valid: false,
      message: "A pausa precisa ficar entre o início e o fim da rotina.",
    };
  }

  return {
    valid: true,
    message: "",
  };
}

function normalizeAfter(value: number, previous: number) {
  let normalized = value;

  while (normalized <= previous) {
    normalized += DAY_SECONDS;
  }

  return normalized;
}

function normalizeCurrentSeconds(
  currentSeconds: number,
  start: number,
  end: number,
) {
  if (currentSeconds < start && currentSeconds + DAY_SECONDS < end) {
    return currentSeconds + DAY_SECONDS;
  }

  return currentSeconds;
}

function getProgress(elapsedSeconds: number, totalSeconds: number) {
  if (totalSeconds <= 0) {
    return 100;
  }

  return Math.min(100, Math.max(0, (elapsedSeconds / totalSeconds) * 100));
}

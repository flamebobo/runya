// Technical Design §36.3：DND 是「当日内的本地分钟区间」，默认 21:00 → 08:00（跨午夜）。
// 纯函数：schedule.ts 与 scheduler 共用，测试直接覆盖跨午夜场景。

export interface DndWindow {
  enabled: boolean;
  startMinute: number;
  endMinute: number;
}

// minuteOfDay 是本地时区的分钟数（0–1439）。
export function isInDnd(window: DndWindow, minuteOfDay: number): boolean {
  if (!window.enabled) return false;
  if (window.startMinute === window.endMinute) return false;
  if (window.startMinute < window.endMinute) {
    // 同日区间，如 09:00 → 12:00
    return minuteOfDay >= window.startMinute && minuteOfDay < window.endMinute;
  }
  // 跨午夜区间，如 21:00 → 08:00
  return minuteOfDay >= window.startMinute || minuteOfDay < window.endMinute;
}

// 普通通知在 DND 内 → 延迟到 DND 结束那一刻。
export function dndEndFor(window: DndWindow, fireAt: number, timezoneOffsetMinutes: number): number {
  const localMs = fireAt + timezoneOffsetMinutes * 60_000;
  const dayStartLocal = Math.floor(localMs / 86_400_000) * 86_400_000;
  const endMsLocal = dayStartLocal + window.endMinute * 60_000;
  // DND 结束时刻若仍在区间内（fireAt 在同日 DND 开始之前、跨午夜区间），退一天找最近的结束点。
  if (endMsLocal <= localMs && isInDnd(window, window.endMinute - 1)) {
    return endMsLocal + 86_400_000 - timezoneOffsetMinutes * 60_000;
  }
  return endMsLocal - timezoneOffsetMinutes * 60_000;
}

export function effectiveFireAt(
  window: DndWindow,
  fireAt: number,
  dndOverride: boolean,
  timezoneOffsetMinutes = 480,
): number {
  if (dndOverride) return fireAt; // 高优先级健康提醒只有显式配置才 override
  if (!isInDnd(window, minuteOfDayOf(fireAt, timezoneOffsetMinutes))) return fireAt;
  return dndEndFor(window, fireAt, timezoneOffsetMinutes);
}

export function minuteOfDayOf(timestampMs: number, timezoneOffsetMinutes: number): number {
  const localMs = timestampMs + timezoneOffsetMinutes * 60_000;
  return Math.floor((localMs % 86_400_000) / 60_000);
}

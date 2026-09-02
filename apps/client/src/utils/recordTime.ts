import { todayIsoDate } from './babyAge';

export function localDayRange(isoDate: string) {
  const parts = isoDate.split('-').map((part) => Number(part));
  const year = parts[0] ?? 2026;
  const month = parts[1] ?? 1;
  const day = parts[2] ?? 1;
  const from = new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
  const to = new Date(year, month - 1, day, 23, 59, 59, 999).getTime();
  return { from, to };
}

export function formatClock(ms: number) {
  const date = new Date(ms);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function timeFromMs(ms: number) {
  return formatClock(ms);
}

export function dateFromMs(ms: number) {
  return todayIsoDate(new Date(ms));
}

export function combineLocalDateTime(date: string, time: string) {
  return new Date(`${date}T${time}:00`).getTime();
}

export function shiftIsoDate(isoDate: string, days: number) {
  const parts = isoDate.split('-').map((part) => Number(part));
  const year = parts[0] ?? 2026;
  const month = parts[1] ?? 1;
  const day = parts[2] ?? 1;
  const next = new Date(year, month - 1, day + days);
  return todayIsoDate(next);
}

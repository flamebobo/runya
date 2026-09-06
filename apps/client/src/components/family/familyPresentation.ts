export const FAMILY_REPEAT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: '不重复' },
  { value: 'DAILY', label: '每天' },
  { value: 'WEEKLY', label: '每周' },
  { value: 'MONTHLY', label: '每月' },
];

const REPEAT_LABELS: Record<string, string> = Object.fromEntries(
  FAMILY_REPEAT_OPTIONS.filter((item) => item.value).map((item) => [item.value, item.label]),
);

const DAY_MS = 86_400_000;

export function isFamilyTaskOverdue(
  task: { completedAt?: number | null; dueAt?: number | null },
  now = Date.now(),
) {
  return !task.completedAt && typeof task.dueAt === 'number' && task.dueAt < now;
}

export function formatFamilyDueDate(dueAt: number) {
  const date = new Date(dueAt);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

export function formatFamilyTaskMeta(
  task: {
    assignedTo?: string | null;
    dueAt?: number | null;
    repeatRule?: string | null;
    experienceReward?: number | null;
    completedAt?: number | null;
  },
  assigneeLabel?: string | null,
  now = Date.now(),
) {
  const parts: string[] = [];
  if (assigneeLabel) parts.push(assigneeLabel);
  if (task.dueAt) {
    parts.push(
      isFamilyTaskOverdue(task, now) ? '日子已经到了' : formatFamilyDueDate(task.dueAt),
    );
  }
  if (task.repeatRule && REPEAT_LABELS[task.repeatRule]) parts.push(REPEAT_LABELS[task.repeatRule]);
  if (task.experienceReward) parts.push(`+${task.experienceReward} 家庭经验`);
  return parts.join(' · ');
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function formatFamilyAnniversaryDate(isoDate: string) {
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (!year || !month || !day) return isoDate;
  return `${year}年${month}月${day}日`;
}

export function familyAnniversaryCountdown(isoDate: string, now = new Date()) {
  const parts = isoDate.split('-');
  if (parts.length !== 3) return '';
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (!month || !day) return '';
  const today = startOfLocalDay(now);
  let next = new Date(today.getFullYear(), month - 1, day);
  if (next.getMonth() !== month - 1) return '';
  if (next < today) next = new Date(today.getFullYear() + 1, month - 1, day);
  const days = Math.round((next.getTime() - today.getTime()) / DAY_MS);
  if (days === 0) return '就是今天';
  if (days === 1) return '明天就是';
  return `还有 ${days} 天`;
}

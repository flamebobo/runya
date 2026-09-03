import type { HealthReminderBody, HealthReminderOffset } from '@runew/contracts';
import { createUlid } from '@runew/shared-utils';

// Technical Design §75：health_event + health_reminder + scheduled_notification
// 必须在同一事务内物化。本文件只放纯计算，副作用由 service 层在事务里执行。

export const REMINDER_OFFSET_MINUTES: Record<
  Exclude<HealthReminderOffset, 'CUSTOM'>,
  number
> = {
  D7: 7 * 24 * 60,
  D3: 3 * 24 * 60,
  D1: 24 * 60,
  SAME_DAY: 2 * 60,
};

export interface PlannedReminder {
  id: string;
  offsetKind: HealthReminderOffset;
  customOffsetMinutes: number | null;
  fireAt: number;
  allowDndOverride: boolean;
}

// 计划提醒：fire_at = scheduled_at - offset。已过去的时点跳过（不补发历史提醒）。
export function planReminders(
  scheduledAt: number,
  body: HealthReminderBody | null | undefined,
  now: number,
): PlannedReminder[] {
  if (!body || body.offsets.length === 0) return [];
  const planned: PlannedReminder[] = [];
  for (const offset of body.offsets) {
    const minutes =
      offset.kind === 'CUSTOM'
        ? (offset.customOffsetMinutes ?? 0)
        : REMINDER_OFFSET_MINUTES[offset.kind];
    const fireAt = scheduledAt - minutes * 60_000;
    if (fireAt <= now) continue;
    planned.push({
      id: createUlid(),
      offsetKind: offset.kind,
      customOffsetMinutes: offset.kind === 'CUSTOM' ? minutes : null,
      fireAt,
      allowDndOverride: offset.allowDndOverride ?? false,
    });
  }
  return planned;
}

// 用户可见的提醒摘要（详情页展示）。id 用于 DELETE /health/reminders/:id。
export function reminderView(planned: PlannedReminder[]) {
  return {
    offsets: planned.map((item) => ({
      id: item.id,
      kind: item.offsetKind,
      customOffsetMinutes: item.customOffsetMinutes,
      fireAt: item.fireAt,
      allowDndOverride: item.allowDndOverride,
      status: 'SCHEDULED' as const,
    })),
  };
}

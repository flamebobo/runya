import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createUlid } from '@runew/shared-utils';
import { healthReminders, runMigrations, scheduledNotifications } from '@runew/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';

const WEAPP_HEADERS = { 'x-client-platform': 'WEAPP' };

// M6 验收：Health CRUD / Reminder / Reschedule / Cancel / Scheduler Restart /
// No Duplicate Notification / DND Crossing Midnight / Notification Read /
// Deep Link / Offline Edit / Unauthorized Baby / No Diagnosis Behavior。

describe('health api', () => {
  let tempDir: string;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let userSeq = 0;

  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runew-m6-test-'));
    process.env.DATABASE_PATH = path.join(tempDir, 'runew.db');
    process.env.LOG_LEVEL = 'silent';
    await runMigrations(process.env.DATABASE_PATH);
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Windows file lock during cleanup — 临时目录，留给系统清理即可。
    }
  });

  async function readyFamily() {
    userSeq += 1;
    const register = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { ...WEAPP_HEADERS, 'idempotency-key': createUlid() },
      payload: {
        username: `m6_${userSeq}_${Date.now().toString(36)}`,
        password: 'password123',
        nickname: '测试妈妈',
      },
    });
    expect(register.statusCode).toBe(201);
    const token = register.json().data.session.token as string;
    const onboarding = await app.inject({
      method: 'POST',
      url: '/api/v1/onboarding/complete',
      headers: {
        ...WEAPP_HEADERS,
        authorization: `Bearer ${token}`,
        'idempotency-key': createUlid(),
      },
      payload: {
        relationship: 'MOM',
        baby: { name: `润润${userSeq}`, birthday: '2026-01-16' },
        topics: ['健康'],
      },
    });
    expect(onboarding.statusCode).toBe(200);
    return {
      familyId: onboarding.json().data.family.id as string,
      babyId: onboarding.json().data.baby.id as string,
      headers: { ...WEAPP_HEADERS, authorization: `Bearer ${token}` },
    };
  }

  function futureAt(daysAhead: number, hourUtc = 10) {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + daysAhead);
    date.setUTCHours(hourUtc, 0, 0, 0);
    return date.getTime();
  }

  async function createEvent(
    family: Awaited<ReturnType<typeof readyFamily>>,
    overrides: Record<string, unknown> = {},
  ) {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/babies/${family.babyId}/health/events`,
      headers: { ...family.headers, 'idempotency-key': createUlid() },
      payload: {
        eventType: 'CHECKUP',
        title: '满月体检',
        scheduledAt: futureAt(14),
        reminder: { offsets: [{ kind: 'D1' }, { kind: 'SAME_DAY' }] },
        ...overrides,
      },
    });
    expect(response.statusCode).toBe(201);
    return response.json().data as {
      id: string;
      version: number;
      scheduledAt: number;
      reminder: { offsets: Array<{ id: string; kind: string; fireAt: number }> };
    };
  }

  it('creates, reads, updates, completes and soft-deletes health events', async () => {
    const family = await readyFamily();
    const created = await createEvent(family);
    expect(created.reminder.offsets).toHaveLength(2);

    const detail = await app.inject({
      method: 'GET',
      url: `/api/v1/health/events/${created.id}`,
      headers: family.headers,
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().data.status).toBe('UPCOMING');
    expect(detail.headers.etag).toBeTruthy();

    // PATCH with If-Match；不带 If-Match 也应成功（P0 宽松）。
    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/v1/health/events/${created.id}`,
      headers: family.headers,
      payload: { title: '满月体检（改约）', status: 'COMPLETED' },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().data.title).toBe('满月体检（改约）');
    expect(patched.json().data.status).toBe('COMPLETED');
    expect(patched.json().data.completedAt).toBeTruthy();

    const completedReminders = await app.db
      .select()
      .from(healthReminders)
      .where(eq(healthReminders.healthEventId, created.id));
    expect(completedReminders.every((item) => item.status === 'CANCELED')).toBe(true);
    const completedReminderIds = new Set(completedReminders.map((item) => item.id));
    const completedSchedules = (
      await app.db
        .select()
        .from(scheduledNotifications)
        .where(eq(scheduledNotifications.sourceType, 'HEALTH_REMINDER'))
    ).filter((item) => completedReminderIds.has(item.sourceId));
    expect(completedSchedules.every((item) => item.status === 'CANCELED')).toBe(true);

    // 终态事项编辑提醒时仍保持 COMPLETED，不能被 PUT 意外重开。
    const reminderEdit = await app.inject({
      method: 'PUT',
      url: `/api/v1/health/events/${created.id}/reminders`,
      headers: family.headers,
      payload: { offsets: [{ kind: 'D1' }] },
    });
    expect(reminderEdit.statusCode).toBe(200);
    expect(reminderEdit.json().data.status).toBe('COMPLETED');
    expect(reminderEdit.json().data.reminder.offsets).toHaveLength(0);

    // If-Match 版本冲突（ETag 契约格式是 "v{version}"）。
    const stale = await app.inject({
      method: 'PATCH',
      url: `/api/v1/health/events/${created.id}`,
      headers: { ...family.headers, 'if-match': '"v1"' },
      payload: { note: '过期版本' },
    });
    expect(stale.statusCode).toBe(409);

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/v1/health/events/${created.id}`,
      headers: family.headers,
    });
    expect(deleted.statusCode).toBe(200);

    const gone = await app.inject({
      method: 'GET',
      url: `/api/v1/health/events/${created.id}`,
      headers: family.headers,
    });
    expect(gone.statusCode).toBe(404);
  });

  it('rejects invalid event type, empty title and oversized note', async () => {
    const family = await readyFamily();
    const badType = await app.inject({
      method: 'POST',
      url: `/api/v1/babies/${family.babyId}/health/events`,
      headers: { ...family.headers, 'idempotency-key': createUlid() },
      payload: { eventType: 'DIAGNOSIS', title: '诊断', scheduledAt: futureAt(7) },
    });
    expect(badType.statusCode).toBe(400);

    const emptyTitle = await app.inject({
      method: 'POST',
      url: `/api/v1/babies/${family.babyId}/health/events`,
      headers: { ...family.headers, 'idempotency-key': createUlid() },
      payload: { eventType: 'CHECKUP', title: '  ', scheduledAt: futureAt(7) },
    });
    expect(emptyTitle.statusCode).toBe(400);
  });

  it('is idempotent on create with the same Idempotency-Key', async () => {
    const family = await readyFamily();
    const key = createUlid();
    const payload = {
      eventType: 'VACCINE',
      title: '乙肝第二针',
      scheduledAt: futureAt(30),
    };
    const first = await app.inject({
      method: 'POST',
      url: `/api/v1/babies/${family.babyId}/health/events`,
      headers: { ...family.headers, 'idempotency-key': key },
      payload,
    });
    const second = await app.inject({
      method: 'POST',
      url: `/api/v1/babies/${family.babyId}/health/events`,
      headers: { ...family.headers, 'idempotency-key': key },
      payload,
    });
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(second.json().data.id).toBe(first.json().data.id);
  });

  it('replaces reminders via PUT and cancels a single reminder via DELETE', async () => {
    const family = await readyFamily();
    const created = await createEvent(family, {
      reminder: { offsets: [{ kind: 'D3' }] },
    });
    expect(created.reminder.offsets[0]!.kind).toBe('D3');

    // PUT 整体替换：D3 → D7 + SAME_DAY。
    const replaced = await app.inject({
      method: 'PUT',
      url: `/api/v1/health/events/${created.id}/reminders`,
      headers: family.headers,
      payload: {
        offsets: [{ kind: 'D7' }, { kind: 'SAME_DAY', allowDndOverride: true }],
      },
    });
    expect(replaced.statusCode).toBe(200);
    const offsets = replaced.json().data.reminder.offsets;
    expect(offsets.map((o: { kind: string }) => o.kind)).toEqual(['D7', 'SAME_DAY']);
    expect(offsets[1]!.allowDndOverride).toBe(true);

    // DELETE 单条提醒。
    const reminderId = offsets[0]!.id;
    const removed = await app.inject({
      method: 'DELETE',
      url: `/api/v1/health/reminders/${reminderId}`,
      headers: family.headers,
    });
    expect(removed.statusCode).toBe(200);

    // 空数组 = 取消全部提醒。
    const cleared = await app.inject({
      method: 'PUT',
      url: `/api/v1/health/events/${created.id}/reminders`,
      headers: family.headers,
      payload: { offsets: [] },
    });
    expect(cleared.statusCode).toBe(200);
    expect(cleared.json().data.reminder.offsets).toHaveLength(0);
  });

  it('reschedules reminders when scheduledAt changes', async () => {
    const family = await readyFamily();
    const created = await createEvent(family);
    const before = created.reminder.offsets.map((o) => o.fireAt);
    const newScheduledAt = futureAt(40);

    const moved = await app.inject({
      method: 'PATCH',
      url: `/api/v1/health/events/${created.id}`,
      headers: family.headers,
      payload: { scheduledAt: newScheduledAt },
    });
    expect(moved.statusCode).toBe(200);
    const after = moved
      .json()
      .data.reminder.offsets.map((o: { fireAt: number }) => o.fireAt);
    expect(after).not.toEqual(before);
    // D1 提醒 = scheduledAt - 24h。
    const dayMs = 24 * 60 * 60 * 1000;
    expect(after).toContain(newScheduledAt - dayMs);
  });

  it('cancels all pending reminders when an event is canceled', async () => {
    const family = await readyFamily();
    const created = await createEvent(family);
    const canceled = await app.inject({
      method: 'PATCH',
      url: `/api/v1/health/events/${created.id}`,
      headers: family.headers,
      payload: { status: 'CANCELED' },
    });
    expect(canceled.statusCode).toBe(200);
    expect(canceled.json().data.status).toBe('CANCELED');

    const reminders = await app.db
      .select()
      .from(healthReminders)
      .where(eq(healthReminders.healthEventId, created.id));
    expect(reminders.every((item) => item.status === 'CANCELED')).toBe(true);
  });

  it('restores a deleted upcoming event with its active reminders', async () => {
    const family = await readyFamily();
    const created = await createEvent(family);
    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/v1/health/events/${created.id}`,
      headers: family.headers,
    });
    expect(deleted.statusCode).toBe(200);

    const restored = await app.inject({
      method: 'POST',
      url: `/api/v1/health/events/${created.id}/restore`,
      headers: family.headers,
    });
    expect(restored.statusCode).toBe(200);
    expect(restored.json().data.status).toBe('UPCOMING');
    expect(restored.json().data.reminder.offsets).toHaveLength(2);

    const reminders = await app.db
      .select()
      .from(healthReminders)
      .where(eq(healthReminders.healthEventId, created.id));
    expect(reminders.filter((item) => item.status === 'SCHEDULED')).toHaveLength(2);
    expect(reminders.filter((item) => item.status === 'CANCELED')).toHaveLength(2);

    const activeIds = new Set(
      reminders.filter((item) => item.status === 'SCHEDULED').map((item) => item.id),
    );
    const schedules = (
      await app.db
        .select()
        .from(scheduledNotifications)
        .where(eq(scheduledNotifications.sourceType, 'HEALTH_REMINDER'))
    ).filter((item) => activeIds.has(item.sourceId));
    expect(schedules).toHaveLength(2);
    expect(schedules.every((item) => item.status === 'SCHEDULED')).toBe(true);
  });

  it('denies access to another family baby and unauthenticated requests', async () => {
    const familyA = await readyFamily();
    const familyB = await readyFamily();
    const created = await createEvent(familyA);

    const cross = await app.inject({
      method: 'GET',
      url: `/api/v1/health/events/${created.id}`,
      headers: familyB.headers,
    });
    expect(cross.statusCode).toBe(403);

    const crossList = await app.inject({
      method: 'GET',
      url: `/api/v1/babies/${familyA.babyId}/health/events`,
      headers: familyB.headers,
    });
    expect(crossList.statusCode).toBe(403);

    const anon = await app.inject({
      method: 'GET',
      url: `/api/v1/babies/${familyA.babyId}/health/events`,
      headers: WEAPP_HEADERS,
    });
    expect(anon.statusCode).toBe(401);
  });

  it('only returns reminders owned by the requesting family member', async () => {
    const family = await readyFamily();
    const created = await createEvent(family, {
      reminder: { offsets: [{ kind: 'D1' }] },
    });

    const memberRegister = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { ...WEAPP_HEADERS, 'idempotency-key': createUlid() },
      payload: {
        username: `m6_member_${Date.now().toString(36)}`,
        password: 'password123',
        nickname: '家庭成员',
      },
    });
    expect(memberRegister.statusCode).toBe(201);
    const memberHeaders = {
      ...WEAPP_HEADERS,
      authorization: `Bearer ${memberRegister.json().data.session.token as string}`,
    };

    const invite = await app.inject({
      method: 'POST',
      url: `/api/v1/families/${family.familyId}/invites`,
      headers: family.headers,
      payload: { relationshipHint: 'DAD', expiresInHours: 72 },
    });
    expect(invite.statusCode).toBe(201);

    const accepted = await app.inject({
      method: 'POST',
      url: `/api/v1/family-invites/${invite.json().data.token as string}/accept`,
      headers: memberHeaders,
      payload: { relationship: 'DAD' },
    });
    expect(accepted.statusCode).toBe(200);

    const detail = await app.inject({
      method: 'GET',
      url: `/api/v1/health/events/${created.id}`,
      headers: memberHeaders,
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().data.reminder.offsets).toHaveLength(0);

    const list = await app.inject({
      method: 'GET',
      url: `/api/v1/babies/${family.babyId}/health/events`,
      headers: memberHeaders,
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().data.items[0].reminder.offsets).toHaveLength(0);
  });

  it('replays offline sync operations without duplicating events or notifications', async () => {
    const family = await readyFamily();
    const operationId = createUlid();
    const entityId = createUlid();
    const scheduledAt = futureAt(21);
    const payload = {
      operationId,
      deviceId: 'device-offline-1',
      clientCreatedAt: scheduledAt - 60_000,
      familyId: family.familyId,
      entityType: 'HEALTH_EVENT',
      entityId,
      op: 'CREATE',
      fullPayload: {
        babyId: family.babyId,
        eventType: 'DENTAL',
        title: '牙齿检查',
        scheduledAt,
        reminderOffsets: [
          { kind: 'D1', customOffsetMinutes: null, allowDndOverride: false },
        ],
      },
    };
    const headers = { ...family.headers, 'content-type': 'application/json' };
    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/sync/push',
      headers,
      payload: {
        deviceId: 'device-offline-1',
        familyId: family.familyId,
        operations: [payload],
      },
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().data.results[0]!.status).toBe('APPLIED');

    // 重放同一 operation：幂等。
    const replay = await app.inject({
      method: 'POST',
      url: '/api/v1/sync/push',
      headers,
      payload: {
        deviceId: 'device-offline-1',
        familyId: family.familyId,
        operations: [payload],
      },
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json().data.results[0]!.status).toBe('APPLIED');

    // Server 只有一条。
    const list = await app.inject({
      method: 'GET',
      url: `/api/v1/babies/${family.babyId}/health/events`,
      headers: family.headers,
    });
    const events = list.json().data.items as Array<{ id: string; title: string }>;
    expect(events.filter((item) => item.id === entityId)).toHaveLength(1);
  });

  it('replays an offline edit with reminder offsets and reschedules the event', async () => {
    const family = await readyFamily();
    const created = await createEvent(family, { reminder: undefined });
    const newScheduledAt = futureAt(45);
    const operation = {
      operationId: createUlid(),
      deviceId: 'device-offline-edit',
      clientCreatedAt: newScheduledAt - 60_000,
      familyId: family.familyId,
      entityType: 'HEALTH_EVENT',
      entityId: created.id,
      op: 'UPDATE',
      baseVersion: created.version,
      baseSnapshot: {
        babyId: family.babyId,
        eventType: 'CHECKUP',
        title: '满月体检',
        scheduledAt: created.scheduledAt,
        status: 'UPCOMING',
        locationName: null,
        locationAddress: null,
        doctorName: null,
        note: null,
        timezoneName: 'Asia/Shanghai',
      },
      patch: {
        scheduledAt: newScheduledAt,
        reminderOffsets: [
          { kind: 'D7', customOffsetMinutes: null, allowDndOverride: false },
        ],
      },
      changedFields: ['scheduledAt', 'reminderOffsets'],
    };
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/sync/push',
      headers: { ...family.headers, 'content-type': 'application/json' },
      payload: {
        deviceId: 'device-offline-edit',
        familyId: family.familyId,
        operations: [operation],
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.results[0]!.status).toBe('APPLIED');

    const reminderRows = await app.db
      .select()
      .from(healthReminders)
      .where(eq(healthReminders.healthEventId, created.id));
    expect(
      reminderRows
        .filter((item) => item.status === 'SCHEDULED')
        .map((item) => item.offsetKind),
    ).toEqual(['D7']);
    expect(reminderRows.find((item) => item.status === 'SCHEDULED')!.fireAt).toBe(
      newScheduledAt - 7 * 24 * 60 * 60 * 1000,
    );
  });

  it('keeps a completed event completed when an offline edit omits status', async () => {
    const family = await readyFamily();
    const created = await createEvent(family, { reminder: undefined });
    const completed = await app.inject({
      method: 'PATCH',
      url: `/api/v1/health/events/${created.id}`,
      headers: family.headers,
      payload: { status: 'COMPLETED' },
    });
    expect(completed.statusCode).toBe(200);
    const completedData = completed.json().data as {
      version: number;
      babyId: string;
      eventType: string;
      title: string;
      scheduledAt: number;
      status: string;
      completedAt: number | null;
      locationName: string | null;
      locationAddress: string | null;
      doctorName: string | null;
      note: string | null;
      timezoneName: string;
    };

    const operation = {
      operationId: createUlid(),
      deviceId: 'device-offline-completed',
      clientCreatedAt: Date.now(),
      familyId: family.familyId,
      entityType: 'HEALTH_EVENT',
      entityId: created.id,
      op: 'UPDATE',
      baseVersion: completedData.version,
      baseSnapshot: {
        babyId: completedData.babyId,
        eventType: completedData.eventType,
        title: completedData.title,
        scheduledAt: completedData.scheduledAt,
        status: completedData.status,
        completedAt: completedData.completedAt,
        locationName: completedData.locationName,
        locationAddress: completedData.locationAddress,
        doctorName: completedData.doctorName,
        note: completedData.note,
        timezoneName: completedData.timezoneName,
      },
      patch: { note: '完成后补充的记录' },
      changedFields: ['note'],
    };
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/sync/push',
      headers: { ...family.headers, 'content-type': 'application/json' },
      payload: {
        deviceId: operation.deviceId,
        familyId: family.familyId,
        operations: [operation],
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.results[0]!.status).toBe('APPLIED');

    const detail = await app.inject({
      method: 'GET',
      url: `/api/v1/health/events/${created.id}`,
      headers: family.headers,
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().data.status).toBe('COMPLETED');
    expect(detail.json().data.note).toBe('完成后补充的记录');
  });
});

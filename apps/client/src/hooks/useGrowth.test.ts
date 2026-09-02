import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GrowthRecordPublic, MilestonePublic } from '@runew/contracts';
import { deriveGrowthView, deriveMonthlyStory } from './useGrowth';
import {
  createRecordLocally,
  deleteRecordLocally,
  restoreRecordLocally,
  updateRecordLocally,
} from '@/local/repository';
import { getEntity, putEntity } from '@/local/entityStore';
import { loadPendingOperations, savePendingOperations } from '@/local/pendingStore';
import { useFamilyRuntimeStore } from '@/stores/runtime';

const FAMILY_ID = '01JDEM4TESTFAMILY0000000000';
const BABY_ID = '01JDEM4TESTBABY000000000000';
const backing = new Map<string, string>();

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  get() {
    return {
      getItem: (key: string) => backing.get(key) ?? null,
      setItem: (key: string, value: string) => void backing.set(key, value),
      removeItem: (key: string) => void backing.delete(key),
      clear: () => void backing.clear(),
    };
  },
});

function growthRecord(
  id: string,
  recordedAt: number,
  values: Pick<GrowthRecordPublic, 'heightCm' | 'weightKg' | 'headCircumferenceCm'>,
): GrowthRecordPublic {
  return {
    id,
    familyId: FAMILY_ID,
    babyId: BABY_ID,
    ...values,
    recordedAt,
    timezoneName: 'Asia/Shanghai',
    note: null,
    createdBy: FAMILY_ID,
    createdAt: recordedAt,
    updatedBy: FAMILY_ID,
    updatedAt: recordedAt,
    version: 1,
  };
}

describe('Growth local-first view', () => {
  beforeEach(() => {
    backing.clear();
    useFamilyRuntimeStore.getState().setFamilyId(FAMILY_ID);
    useFamilyRuntimeStore.getState().setBabyId(BABY_ID);
  });

  it('sorts raw records and derives latest partial metrics plus chronological trends', () => {
    const first = Date.UTC(2026, 6, 1);
    const second = Date.UTC(2026, 7, 1);
    const third = Date.UTC(2026, 8, 1);
    const view = deriveGrowthView([
      growthRecord('01JDEM4GROWTH0000000000000', second, {
        heightCm: null,
        weightKg: 8.4,
        headCircumferenceCm: null,
      }),
      growthRecord('01JDEM4GROWTH0000000000001', first, {
        heightCm: null,
        weightKg: null,
        headCircumferenceCm: 43.2,
      }),
      growthRecord('01JDEM4GROWTH0000000000002', third, {
        heightCm: 73.1,
        weightKg: 8.7,
        headCircumferenceCm: 44,
      }),
    ]);

    expect(view.items.map((item) => item.recordedAt)).toEqual([third, second, first]);
    expect(view.latest.height?.value).toBe(73.1);
    expect(view.latest.weight?.value).toBe(8.7);
    expect(view.latest.head?.value).toBe(44);
    expect(view.trends.weight.map((point) => point.value)).toEqual([8.4, 8.7]);
    expect(view.trends.head.map((point) => point.value)).toEqual([43.2, 44]);
  });

  it('builds the monthly story from local growth and milestone facts', () => {
    const first = Date.UTC(2026, 8, 2, 10);
    const latest = Date.UTC(2026, 8, 20, 10);
    const growth = [
      growthRecord('01JDEM4STORYGROWTH000000001', first, {
        heightCm: 71,
        weightKg: 8.2,
        headCircumferenceCm: null,
      }),
      growthRecord('01JDEM4STORYGROWTH000000002', latest, {
        heightCm: 72.5,
        weightKg: 8.5,
        headCircumferenceCm: null,
      }),
    ];
    const milestone: MilestonePublic = {
      id: '01JDEM4STORYMILESTONE0000001',
      familyId: FAMILY_ID,
      babyId: BABY_ID,
      title: '第一次走路',
      description: null,
      happenedAt: Date.UTC(2026, 8, 12, 9),
      timezoneName: 'Asia/Shanghai',
      coverMediaId: null,
      createdBy: FAMILY_ID,
      createdAt: Date.UTC(2026, 8, 12, 9),
      updatedBy: FAMILY_ID,
      updatedAt: Date.UTC(2026, 8, 12, 9),
      version: 1,
      syncState: 'pending',
    };

    const story = deriveMonthlyStory('2026-09', '润润', growth, [milestone]);
    expect(story).toMatchObject({
      title: '这个月的润润',
      growthRecordCount: 2,
      milestoneCount: 1,
      milestones: [milestone],
    });
    expect(story.summary).toContain('留下了 2 次成长测量');
    expect(story.summary).toContain('收藏了 1 个第一次');
    expect(story.changes).toContainEqual({
      metric: 'height',
      first: 71,
      latest: 72.5,
      delta: 1.5,
      unit: 'cm',
    });
  });

  it('keeps offline Growth create, edit, delete, and restore across fresh reads', async () => {
    const created = await createRecordLocally('GROWTH_RECORD', {
      babyId: BABY_ID,
      heightCm: 72.5,
      weightKg: null,
      headCircumferenceCm: null,
      recordedAt: Date.UTC(2026, 8, 2, 12),
      timezoneName: 'Asia/Shanghai',
      note: null,
    });

    const afterRestart = await getEntity('GROWTH_RECORD', created.entityId);
    expect(afterRestart?.payload.heightCm).toBe(72.5);
    expect(afterRestart?.pendingOpId).toBe(created.operationId);
    expect((await loadPendingOperations())[0]?.op).toBe('CREATE');

    await savePendingOperations([]);
    await putEntity({ ...afterRestart!, pendingOpId: null });
    await updateRecordLocally('GROWTH_RECORD', created.entityId, {
      weightKg: 8.6,
      note: '晚饭前量的',
    });
    expect((await getEntity('GROWTH_RECORD', created.entityId))?.payload.weightKg).toBe(
      8.6,
    );
    expect((await loadPendingOperations())[0]?.op).toBe('UPDATE');

    const updated = await getEntity('GROWTH_RECORD', created.entityId);
    await savePendingOperations([]);
    await putEntity({ ...updated!, pendingOpId: null });
    await deleteRecordLocally('GROWTH_RECORD', created.entityId);
    expect((await getEntity('GROWTH_RECORD', created.entityId))?.deleted).toBe(true);
    expect((await loadPendingOperations())[0]?.op).toBe('DELETE');

    const deleted = await getEntity('GROWTH_RECORD', created.entityId);
    await savePendingOperations([]);
    await putEntity({ ...deleted!, pendingOpId: null });
    await restoreRecordLocally('GROWTH_RECORD', created.entityId);
    expect((await getEntity('GROWTH_RECORD', created.entityId))?.deleted).toBe(false);
    expect((await loadPendingOperations())[0]?.op).toBe('RESTORE');
  });

  it('persists Milestone CRUD through the same pending-operation framework', async () => {
    const created = await createRecordLocally('MILESTONE', {
      babyId: BABY_ID,
      title: '第一次自己站起来',
      description: '扶着沙发站了好一会儿',
      happenedAt: Date.UTC(2026, 8, 2, 18),
      timezoneName: 'Asia/Shanghai',
      coverMediaId: null,
    });
    const local = await getEntity('MILESTONE', created.entityId);
    expect(local?.payload.title).toBe('第一次自己站起来');
    expect(local?.pendingOpId).toBe(created.operationId);

    await savePendingOperations([]);
    await putEntity({ ...local!, pendingOpId: null });
    await updateRecordLocally('MILESTONE', created.entityId, {
      description: '扶着沙发站稳了',
    });
    expect((await getEntity('MILESTONE', created.entityId))?.payload.description).toBe(
      '扶着沙发站稳了',
    );

    const updated = await getEntity('MILESTONE', created.entityId);
    await savePendingOperations([]);
    await putEntity({ ...updated!, pendingOpId: null });
    await deleteRecordLocally('MILESTONE', created.entityId);
    expect((await getEntity('MILESTONE', created.entityId))?.deleted).toBe(true);
  });

  afterEach(() => {
    backing.clear();
  });
});

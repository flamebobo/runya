import { describe, expect, it } from 'vitest';
import { cacheLocalFamilyTask, deleteLocalFamilyTask, enqueueFamilyTaskOperation, loadFamilyTaskOperations, listLocalFamilyTasks, saveLocalFamilyTask } from './familyTaskStore';

describe('family task offline store', () => {
  it('persists a task for restart and keeps family scope', async () => {
    await saveLocalFamilyTask({ id: '01J00000000000000000000001', familyId: '01J00000000000000000000002', title: '一起散步', version: 1 });
    expect((await listLocalFamilyTasks('01J00000000000000000000002'))[0]?.title).toBe('一起散步');
    expect(await listLocalFamilyTasks('01J00000000000000000000003')).toEqual([]);
  });
  it('keeps offline deletion across reloads', async () => {
    const task = { id: '01J00000000000000000000003', familyId: '01J00000000000000000000004', title: '一起收玩具', version: 1 };
    await saveLocalFamilyTask(task);
    await deleteLocalFamilyTask(task);
    expect((await listLocalFamilyTasks(task.familyId)).some((item) => item.id === task.id)).toBe(false);
  });
  it('caches a remote task without creating a pending operation', async () => {
    await cacheLocalFamilyTask({ id: '01J00000000000000000000006', familyId: '01J00000000000000000000007', title: '远程同步的小事', version: 3 });
    expect((await listLocalFamilyTasks('01J00000000000000000000007'))[0]?.title).toBe('远程同步的小事');
    expect(await loadFamilyTaskOperations()).toEqual([]);
  });
  it('persists replayable operation metadata', async () => {
    const operationId = await enqueueFamilyTaskOperation({ familyId: '01J00000000000000000000004', taskId: '01J00000000000000000000005', op: 'COMPLETE' });
    expect((await loadFamilyTaskOperations()).some((item) => item.operationId === operationId && item.op === 'COMPLETE')).toBe(true);
  });
  it('serializes concurrent queue writes without losing an operation', async () => {
    const [first, second] = await Promise.all([
      enqueueFamilyTaskOperation({ familyId: '01J00000000000000000000008', taskId: '01J00000000000000000000009', op: 'UPDATE' }),
      enqueueFamilyTaskOperation({ familyId: '01J00000000000000000000008', taskId: '01J00000000000000000000010', op: 'DELETE' }),
    ]);
    const ids = (await loadFamilyTaskOperations()).map((item) => item.operationId);
    expect(ids).toEqual(expect.arrayContaining([first, second]));
  });
});

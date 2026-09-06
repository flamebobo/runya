import { createUlid } from '@runew/shared-utils';
import { platformAdapters } from '@/adapters/platform';
import { getEntity, listEntities, putEntity } from './entityStore';

const TYPE = 'family_task';
const QUEUE_KEY = 'runew_family_task_operations';
let queueWrite = Promise.resolve();
export type FamilyTaskOperation = { operationId: string; familyId: string; taskId: string; op: 'CREATE' | 'UPDATE' | 'DELETE' | 'COMPLETE'; payload?: LocalFamilyTask };
export type LocalFamilyTask = {
  id: string;
  familyId: string;
  title: string;
  note?: string | null;
  dueAt?: number | null;
  repeatRule?: 'DAILY' | 'WEEKLY' | 'MONTHLY' | null;
  assignedTo?: string | null;
  experienceReward?: number;
  completedAt?: number | null;
  version: number;
};

export async function saveLocalFamilyTask(task: LocalFamilyTask, pendingOpId: string | null = createUlid()) {
  await putEntity({ entityType: TYPE, entityId: task.id, version: task.version, deleted: false, payload: task as unknown as Record<string, unknown>, pendingOpId });
  return pendingOpId;
}
export async function cacheLocalFamilyTask(task: LocalFamilyTask) {
  await saveLocalFamilyTask(task, null);
}
export async function deleteLocalFamilyTask(task: LocalFamilyTask, pendingOpId = createUlid()) {
  await putEntity({
    entityType: TYPE,
    entityId: task.id,
    version: task.version + 1,
    deleted: true,
    payload: task as unknown as Record<string, unknown>,
    pendingOpId,
  });
  return pendingOpId;
}
export async function enqueueFamilyTaskOperation(operation: Omit<FamilyTaskOperation, 'operationId'> & { operationId?: string }) {
  const next = { ...operation, operationId: operation.operationId ?? createUlid() };
  await mutateQueue((queue) => {
    if (!queue.some((item) => item.operationId === next.operationId)) queue.push(next);
  });
  return next.operationId;
}
export async function loadFamilyTaskOperations(): Promise<FamilyTaskOperation[]> {
  const raw = await platformAdapters.storage.getItem(QUEUE_KEY);
  if (!raw) return [];
  try { const parsed = JSON.parse(raw) as unknown; return Array.isArray(parsed) ? parsed as FamilyTaskOperation[] : []; } catch { return []; }
}
export async function removeFamilyTaskOperation(operationId: string) {
  await mutateQueue((queue) => queue.filter((item) => item.operationId !== operationId));
}

async function mutateQueue(mutator: (queue: FamilyTaskOperation[]) => FamilyTaskOperation[] | void) {
  const pending = queueWrite.then(async () => {
    const queue = await loadFamilyTaskOperations();
    const result = mutator(queue);
    await platformAdapters.storage.setItem(QUEUE_KEY, JSON.stringify(result ?? queue));
  });
  queueWrite = pending.then(() => undefined, () => undefined);
  return pending;
}
export async function getLocalFamilyTask(id: string) { const entity = await getEntity(TYPE, id); return entity?.payload as unknown as LocalFamilyTask | undefined; }
export async function listLocalFamilyTasks(familyId: string) { const rows = await listEntities(TYPE); return rows.filter((row) => row.payload.familyId === familyId && !row.deleted).map((row) => row.payload as unknown as LocalFamilyTask); }

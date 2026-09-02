import { platformAdapters } from '@/adapters/platform';

export interface StoredEntity {
  entityType: string;
  entityId: string;
  version: number;
  deleted: boolean;
  payload: Record<string, unknown>;
  pendingOpId: string | null;
}

const KEY_PREFIX = 'runew_entity_';

function entityKey(entityType: string, entityId: string) {
  return `${KEY_PREFIX}${entityType}_${entityId}`;
}

function indexKey(entityType: string) {
  return `${KEY_PREFIX}index_${entityType}`;
}

async function readIndex(entityType: string): Promise<string[]> {
  const raw = await platformAdapters.storage.getItem(indexKey(entityType));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

async function writeIndex(entityType: string, ids: string[]) {
  await platformAdapters.storage.setItem(indexKey(entityType), JSON.stringify(ids));
}

export async function getEntity(entityType: string, entityId: string): Promise<StoredEntity | null> {
  const raw = await platformAdapters.storage.getItem(entityKey(entityType, entityId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredEntity;
  } catch {
    return null;
  }
}

export async function putEntity(entity: StoredEntity): Promise<void> {
  await platformAdapters.storage.setItem(entityKey(entity.entityType, entity.entityId), JSON.stringify(entity));
  const index = await readIndex(entity.entityType);
  if (!index.includes(entity.entityId)) {
    await writeIndex(entity.entityType, [...index, entity.entityId]);
  }
}

export async function listEntities(entityType: string): Promise<StoredEntity[]> {
  const ids = await readIndex(entityType);
  const entities = await Promise.all(ids.map((id) => getEntity(entityType, id)));
  return entities.filter((entity): entity is StoredEntity => entity !== null);
}

export async function removeEntity(entityType: string, entityId: string): Promise<void> {
  await platformAdapters.storage.removeItem(entityKey(entityType, entityId));
  const index = await readIndex(entityType);
  await writeIndex(entityType, index.filter((id) => id !== entityId));
}

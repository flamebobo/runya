import { syncOperations } from '@runew/db';
import type { schema } from '@runew/db';
import type { RecordKind } from '@runew/domain-types';
import type { RecordPayload } from '@runew/contracts';
import { and, asc, eq, gt } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';

type Database = LibSQLDatabase<typeof schema>;
type DbExecutor = Pick<Database, 'insert'>;

export interface SyncLogEntry {
  seq: number;
  entityType: string;
  entityId: string;
  op: 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE';
  version: number;
  payload: RecordPayload | null;
  deleted: boolean;
  actorUserId: string | null;
  occurredAt: number;
}

export interface AppendLogInput {
  operationId: string;
  familyId: string;
  actorUserId: string;
  deviceId: string | null;
  entityType: string;
  entityId: string;
  op: 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE';
  entityVersion: number;
  changedFields?: string[];
}

// sync_operations 只追加：幂等键撞唯一索引时说明该 operation 已入账，返回 false。
// 同一 operationId 不同内容属于客户端故障，靠唯一索引天然拒绝，不做 silent overwrite。
export async function appendSyncLog(
  db: DbExecutor,
  input: AppendLogInput,
  now: number,
): Promise<boolean> {
  try {
    await db.insert(syncOperations).values({
      operationId: input.operationId,
      familyId: input.familyId,
      actorUserId: input.actorUserId,
      deviceId: input.deviceId,
      entityType: input.entityType,
      entityId: input.entityId,
      op: input.op,
      entityVersion: input.entityVersion,
      changedFieldsJson: input.changedFields?.length
        ? JSON.stringify(input.changedFields)
        : null,
      occurredAt: now,
    });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('uq_sync_operations_operation_id') || message.includes('UNIQUE')) {
      return false;
    }
    throw error;
  }
}

export async function readSyncLog(
  db: Database,
  familyId: string,
  afterSeq: number,
  limit: number,
): Promise<{ changes: SyncLogEntry[]; nextCursor: number; hasMore: boolean }> {
  const rows = await db
    .select()
    .from(syncOperations)
    .where(and(eq(syncOperations.familyId, familyId), gt(syncOperations.seq, afterSeq)))
    .orderBy(asc(syncOperations.seq))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const changes = page.map((row) => {
    const result = row.resultJson ? (JSON.parse(row.resultJson) as {
      payload?: RecordPayload;
      deleted?: boolean;
    }) : null;
    return {
      seq: row.seq,
      entityType: row.entityType,
      entityId: row.entityId,
      op: row.op as SyncLogEntry['op'],
      version: row.entityVersion,
      payload: result?.payload ?? null,
      deleted: result?.deleted ?? false,
      actorUserId: row.actorUserId,
      occurredAt: row.occurredAt,
    };
  });

  return {
    changes,
    nextCursor: page.length > 0 ? page[page.length - 1]!.seq : afterSeq,
    hasMore,
  };
}

export async function latestSeq(db: Database): Promise<number> {
  const result = await db.all<{ seq: number | null }>(
    'SELECT MAX(seq) as seq FROM sync_operations',
  );
  return result[0]?.seq ?? 0;
}

export function kindOfEntityType(entityType: string): RecordKind | null {
  if (entityType === 'DIAPER_RECORD') return 'DIAPER';
  if (entityType === 'FOOD_RECORD') return 'FOOD';
  return null;
}

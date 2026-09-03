import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateHealthEventBody,
  HealthEventPublic,
  UpdateHealthEventBody,
} from '@runew/contracts';
import {
  createHealthEvent,
  deleteHealthEvent,
  deleteHealthReminder,
  fetchHealthEventDetail,
  fetchHealthEvents,
  replaceHealthReminders,
  updateHealthEvent,
} from '@/api/health';
import { getSyncNow } from '@/hooks/useSyncNowBridge';
import {
  createRecordLocally,
  deleteRecordLocally,
  recoverPendingEntities,
  updateRecordLocally,
} from '@/local/repository';
import { getEntity, listEntities, putEntity, removeEntity } from '@/local/entityStore';
import { getFamilyRuntimeStore } from '@/stores/runtime';
import type { SyncEntityType } from '@runew/contracts';

const HEALTH_ENTITY: SyncEntityType = 'HEALTH_EVENT';

export const healthQueryKey = (babyId: string) => ['health', babyId] as const;
export const healthDetailQueryKey = (id: string) => ['health-detail', id] as const;

function localEvent(
  entity: Awaited<ReturnType<typeof listEntities>>[number],
): HealthEventPublic {
  const payload = entity.payload;
  const familyId = getFamilyRuntimeStore().familyId ?? '';
  return {
    id: entity.entityId,
    familyId: String(payload.familyId ?? familyId),
    babyId: String(payload.babyId ?? ''),
    eventType: (payload.eventType ?? 'CHECKUP') as HealthEventPublic['eventType'],
    title: String(payload.title ?? ''),
    scheduledAt: Number(payload.scheduledAt ?? 0),
    completedAt:
      typeof payload.completedAt === 'number' ? payload.completedAt : null,
    status: (payload.status ?? 'UPCOMING') as HealthEventPublic['status'],
    locationName: typeof payload.locationName === 'string' ? payload.locationName : null,
    locationAddress:
      typeof payload.locationAddress === 'string' ? payload.locationAddress : null,
    doctorName: typeof payload.doctorName === 'string' ? payload.doctorName : null,
    note: typeof payload.note === 'string' ? payload.note : null,
    timezoneName: String(payload.timezoneName ?? 'Asia/Shanghai'),
    createdBy: String(payload.createdBy ?? familyId),
    createdAt: Number(payload.createdAt ?? payload.scheduledAt ?? Date.now()),
    updatedBy: String(payload.updatedBy ?? familyId),
    updatedAt: Number(payload.updatedAt ?? payload.scheduledAt ?? Date.now()),
    version: entity.version,
    syncState: entity.pendingOpId ? 'pending' : 'synced',
  };
}

// 服务端列表写回本地缓存；本地有未同步意图的行不被覆盖。
async function cacheServerEvents(babyId: string, items: HealthEventPublic[]) {
  const localAll = await listEntities(HEALTH_ENTITY);
  const localById = new Map(localAll.map((entity) => [entity.entityId, entity]));
  for (const item of items) {
    const local = localById.get(item.id);
    if (local?.pendingOpId) continue;
    await putEntity({
      entityType: HEALTH_ENTITY,
      entityId: item.id,
      version: item.version,
      deleted: false,
      payload: { ...item, babyId } as unknown as Record<string, unknown>,
      pendingOpId: null,
    });
  }
  // 服务端已不存在的行清理（本地无 pending 意图才删）。
  const serverIds = new Set(items.map((item) => item.id));
  for (const entity of localAll) {
    if (entity.payload.babyId === babyId && !serverIds.has(entity.entityId) && !entity.pendingOpId) {
      await removeEntity(HEALTH_ENTITY, entity.entityId);
    }
  }
}

export function useHealthEventsQuery(babyId: string | null) {
  return useQuery({
    queryKey: healthQueryKey(babyId ?? ''),
    enabled: Boolean(babyId),
    staleTime: 30_000,
    queryFn: async () => {
      const server = await fetchHealthEvents(babyId!).catch(() => null);
      if (server) await cacheServerEvents(babyId!, server.items);
      await recoverPendingEntities([HEALTH_ENTITY]);
      const local = (await listEntities(HEALTH_ENTITY))
        .filter(
          (entity) =>
            !entity.deleted &&
            entity.payload.babyId === babyId &&
            (server ? Boolean(entity.pendingOpId) : true),
        )
        .map(localEvent);
      const byId = new Map((server?.items ?? []).map((item) => [item.id, item]));
      for (const item of local) byId.set(item.id, item);
      return {
        items: [...byId.values()].sort(
          (a, b) => a.scheduledAt - b.scheduledAt || a.id.localeCompare(b.id),
        ),
      };
    },
  });
}

export function useHealthEventDetailQuery(id: string | null) {
  return useQuery({
    queryKey: healthDetailQueryKey(id ?? ''),
    enabled: Boolean(id),
    queryFn: async () => {
      await recoverPendingEntities([HEALTH_ENTITY]);
      const local = await getEntity(HEALTH_ENTITY, id!);
      if (local?.deleted) throw new Error('这个健康事项已移到最近删除');
      if (local?.pendingOpId) return localEvent(local);
      const server = await fetchHealthEventDetail(id!).catch(() => null);
      if (server) return server;
      if (local) return localEvent(local);
      throw new Error('这个健康事项还没找到');
    },
  });
}

// 本地优先写路径：先落本地实体 + pending，再由 SyncEngine 推送；
// 提醒（reminderOffsets）随 CREATE/UPDATE payload 走，服务端同步回放负责物化通知。
// 提醒的即时增删走在线 API（需要服务端立刻重排 scheduled_notifications）。
export function useHealthActions(babyId: string | null) {
  const queryClient = useQueryClient();
  const syncNow = getSyncNow();

  async function refresh(id?: string) {
    if (babyId) {
      await queryClient.invalidateQueries({ queryKey: healthQueryKey(babyId) });
    }
    if (id) {
      await queryClient.invalidateQueries({ queryKey: healthDetailQueryKey(id) });
    }
    if (babyId) void syncNow?.();
  }

  async function save(values: CreateHealthEventBody & { id?: string }) {
    const { id, ...body } = values;
    if (id) {
      const current = await getEntity(HEALTH_ENTITY, id);
      const patch: UpdateHealthEventBody & Record<string, unknown> = { ...body };
      const result = await updateRecordLocally(
        HEALTH_ENTITY,
        id,
        patch as Record<string, never>,
        { baseVersion: current?.version ?? 1 },
      );
      await refresh(id);
      return result;
    }
    const result = await createRecordLocally(HEALTH_ENTITY, {
      ...body,
      babyId: babyId ?? '',
    } as never);
    await refresh(result.entityId);
    return result;
  }

  async function complete(item: HealthEventPublic) {
    const current = await getEntity(HEALTH_ENTITY, item.id);
    await updateRecordLocally(
      HEALTH_ENTITY,
      item.id,
      {
        status: 'COMPLETED',
        completedAt: Date.now(),
      } as never,
      { baseVersion: current?.version ?? item.version },
    );
    await refresh(item.id);
  }

  async function remove(item: { id: string }) {
    const result = await deleteRecordLocally(HEALTH_ENTITY, item.id);
    await refresh(item.id);
    return result;
  }

  return { save, complete, remove, refreshing: refresh };
}

// 在线操作：提醒重排与单条提醒删除必须让服务端同步取消/物化 scheduled_notifications，
// 不能只走离线队列（否则取消动作要等联网才生效）。
export function useHealthReminderActions() {
  const queryClient = useQueryClient();

  async function refresh(eventId: string) {
    await queryClient.invalidateQueries({
      queryKey: healthDetailQueryKey(eventId),
    });
    await queryClient.invalidateQueries({ queryKey: ['health'] });
  }

  const replace = useMutation({
    mutationFn: async (input: {
      eventId: string;
      offsets: Array<{
        kind: string;
        customOffsetMinutes?: number;
        allowDndOverride?: boolean;
      }>;
      ifMatch?: string;
    }) =>
      replaceHealthReminders(
        input.eventId,
        { offsets: input.offsets as never },
        { ifMatch: input.ifMatch },
      ),
    onSuccess: (data) => refresh(data.id),
  });

  const removeOne = useMutation({
    mutationFn: async (input: { reminderId: string; eventId: string }) => {
      const result = await deleteHealthReminder(input.reminderId);
      await refresh(input.eventId);
      return result;
    },
  });

  return { replace, removeOne };
}

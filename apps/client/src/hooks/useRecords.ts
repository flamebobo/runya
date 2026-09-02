import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  PendingOperation,
  RecordStatsQuery,
  TimelineItem,
  TimelineQuery,
  TimelineResponse,
} from '@runew/contracts';
import { DiaperType } from '@runew/domain-types';
import { formatDurationLabel } from '@runew/shared-utils';
import { fetchRecordStats, fetchTimeline } from '@/api/records';
import { getFamilyRuntimeStore } from '@/stores/runtime';
import { listEntities, type StoredEntity } from '@/local/entityStore';
import { loadPendingOperations } from '@/local/pendingStore';
import { getSyncNow } from '@/hooks/useSyncNowBridge';
import { bootstrapQueryKey } from '@/hooks/useBootstrap';

export function recordsQueryKey(babyId: string, query: Partial<TimelineQuery>) {
  return ['records', babyId, query] as const;
}

export function recordStatsQueryKey(babyId: string, query: RecordStatsQuery) {
  return ['record-stats', babyId, query] as const;
}

export function useRecordStatsQuery(babyId: string | null, query: RecordStatsQuery) {
  return useQuery({
    queryKey: recordStatsQueryKey(babyId ?? '', query),
    enabled: Boolean(babyId),
    // 图表切换要求「点开就有」：访问过的维度/日期直接从缓存渲染
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    queryFn: () => fetchRecordStats(babyId!, query),
  });
}

// 本地时间线：M3 同步实体（尿布/辅食）直接从本地库读，离线立即可见。
async function localTimelineItems(babyId: string): Promise<TimelineItem[]> {
  const [diapers, foods, pending] = await Promise.all([
    listEntities('DIAPER_RECORD'),
    listEntities('FOOD_RECORD'),
    loadPendingOperations(),
  ]);
  const pendingByEntity = new Map(
    pending.map((operation) => [operation.entityId, operation]),
  );

  const diaperItems = diapers
    .filter((entity) => !entity.deleted && entity.payload.babyId === babyId)
    .map((entity) => toDiaperItem(entity, pendingByEntity.get(entity.entityId)));
  const foodItems = foods
    .filter((entity) => !entity.deleted && entity.payload.babyId === babyId)
    .map((entity) => toFoodItem(entity, pendingByEntity.get(entity.entityId)));

  return [...diaperItems, ...foodItems].sort(
    (a, b) => b.recordedAt - a.recordedAt || b.id.localeCompare(a.id),
  );
}

function toDiaperItem(entity: StoredEntity, pending?: PendingOperation): TimelineItem {
  const payload = entity.payload as { diaperType?: DiaperType; recordedAt?: number };
  const label =
    payload.diaperType === DiaperType.DIRTY
      ? '便'
      : payload.diaperType === DiaperType.BOTH
        ? '湿+便'
        : payload.diaperType === DiaperType.DRY
          ? '干'
          : '湿';
  return {
    id: entity.entityId,
    kind: 'DIAPER',
    recordedAt: payload.recordedAt ?? 0,
    title: `尿布 · ${label}`,
    subtitle: null,
    status: null,
    version: entity.version,
    diaperType: payload.diaperType,
    syncState: pending ? 'pending' : entity.pendingOpId ? 'pending' : 'synced',
  };
}

function toFoodItem(entity: StoredEntity, pending?: PendingOperation): TimelineItem {
  const payload = entity.payload as {
    foodName?: string;
    amountText?: string | null;
    recordedAt?: number;
  };
  return {
    id: entity.entityId,
    kind: 'FOOD',
    recordedAt: payload.recordedAt ?? 0,
    title: payload.amountText
      ? `辅食 · ${payload.foodName} ${payload.amountText}`
      : `辅食 · ${payload.foodName}`,
    subtitle: null,
    status: null,
    version: entity.version,
    syncState: pending ? 'pending' : entity.pendingOpId ? 'pending' : 'synced',
  };
}

const ITEM_KIND_BY_FILTER = {
  feeding: 'FEEDING',
  sleep: 'SLEEP',
  diaper: 'DIAPER',
  food: 'FOOD',
} as const satisfies Record<
  Exclude<TimelineQuery['kind'], 'all'>,
  TimelineItem['kind']
>;

export function matchesTimelineQuery(
  item: Pick<TimelineItem, 'kind' | 'recordedAt'>,
  query: Partial<TimelineQuery>,
) {
  if (query.from != null && item.recordedAt < query.from) return false;
  if (query.to != null && item.recordedAt > query.to) return false;
  if (
    query.kind &&
    query.kind !== 'all' &&
    item.kind !== ITEM_KIND_BY_FILTER[query.kind]
  ) {
    return false;
  }
  return true;
}

export function useTimelineQuery(babyId: string | null, query: Partial<TimelineQuery>) {
  const syncNow = getSyncNow();
  return useQuery({
    queryKey: [...recordsQueryKey(babyId ?? '', query), 'local-v1'],
    enabled: Boolean(babyId),
    staleTime: 5_000,
    refetchInterval: 15_000,
    queryFn: async (): Promise<TimelineResponse> => {
      void syncNow;
      const server = await fetchTimeline(babyId!, query).catch(() => null);
      const localItems = await localTimelineItems(babyId!);
      const serverIds = new Set(
        server?.items.map((item) => `${item.kind}-${item.id}`) ?? [],
      );
      const localOnly = localItems.filter(
        (item) =>
          !serverIds.has(`${item.kind}-${item.id}`) &&
          matchesTimelineQuery(item, query),
      );

      if (!server) {
        // 离线：本地时间线兜底，绝不让页面空白或报错。
        const items = localOnly;
        return {
          items,
          nextCursor: null,
          summary: buildSummary(items, 0),
          running: { sleep: null, feeding: null },
        };
      }

      const items = [...localOnly, ...server.items].sort(
        (a, b) => b.recordedAt - a.recordedAt || b.id.localeCompare(a.id),
      );
      return {
        ...server,
        items,
        summary: {
          ...server.summary,
          diaperCount:
            server.summary.diaperCount +
            localOnly.filter((item) => item.kind === 'DIAPER').length,
          foodCount:
            server.summary.foodCount +
            localOnly.filter((item) => item.kind === 'FOOD').length,
        },
      };
    },
  });
}

function buildSummary(
  items: TimelineItem[],
  sleepSeconds: number,
): TimelineResponse['summary'] {
  return {
    feedingCount: items.filter((item) => item.kind === 'FEEDING').length,
    sleepSeconds,
    diaperCount: items.filter((item) => item.kind === 'DIAPER').length,
    foodCount: items.filter((item) => item.kind === 'FOOD').length,
  };
}

export function useInvalidateCare(babyId: string | null) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['records'] });
    void queryClient.invalidateQueries({ queryKey: ['record-stats'] });
    void queryClient.invalidateQueries({ queryKey: bootstrapQueryKey });
    if (babyId) {
      void queryClient.invalidateQueries({ queryKey: ['records', babyId] });
    }
    const familyId = getFamilyRuntimeStore().familyId;
    if (familyId) {
      void import('@/local/syncEngine').then(({ runSyncCycle }) =>
        runSyncCycle(familyId),
      );
    }
  };
}

export { formatDurationLabel };

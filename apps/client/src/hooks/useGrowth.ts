import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createGrowthBodySchema,
  createMilestoneBodySchema,
  type CreateGrowthBody,
  type CreateMilestoneBody,
  type GrowthListResponse,
  type GrowthRecordPublic,
  type MilestonePublic,
  type MonthlyMetricChange,
  type MonthlyStoryResponse,
} from '@runew/contracts';
import {
  fetchGrowth,
  fetchGrowthDetail,
  fetchMilestoneDetail,
  fetchMilestones,
} from '@/api/growth';
import { getSyncNow } from '@/hooks/useSyncNowBridge';
import { getEntity, listEntities, putEntity } from '@/local/entityStore';
import {
  createRecordLocally,
  deleteRecordLocally,
  recoverPendingEntities,
  restoreRecordLocally,
  updateRecordLocally,
} from '@/local/repository';
import { loadPendingOperations } from '@/local/pendingStore';
import { getFamilyRuntimeStore } from '@/stores/runtime';

export const growthQueryKey = (babyId: string) => ['growth', babyId] as const;
export const growthDetailQueryKey = (id: string) => ['growth-detail', id] as const;
export const milestoneQueryKey = (babyId: string) => ['milestones', babyId] as const;
export const milestoneDetailQueryKey = (id: string) =>
  ['milestone-detail', id] as const;
export const monthlyStoryQueryKey = (babyId: string, month: string) =>
  ['growth-monthly-story', babyId, month] as const;

function localGrowth(
  entity: Awaited<ReturnType<typeof listEntities>>[number],
): GrowthRecordPublic {
  const payload = entity.payload;
  return {
    id: entity.entityId,
    familyId: String(payload.familyId ?? getFamilyRuntimeStore().familyId ?? ''),
    babyId: String(payload.babyId ?? ''),
    heightCm: typeof payload.heightCm === 'number' ? payload.heightCm : null,
    weightKg: typeof payload.weightKg === 'number' ? payload.weightKg : null,
    headCircumferenceCm:
      typeof payload.headCircumferenceCm === 'number'
        ? payload.headCircumferenceCm
        : null,
    recordedAt: Number(payload.recordedAt ?? 0),
    timezoneName: String(payload.timezoneName ?? 'Asia/Shanghai'),
    note: typeof payload.note === 'string' ? payload.note : null,
    createdBy: String(payload.createdBy ?? getFamilyRuntimeStore().familyId ?? ''),
    createdAt: Number(payload.createdAt ?? payload.recordedAt ?? Date.now()),
    updatedBy: String(payload.updatedBy ?? getFamilyRuntimeStore().familyId ?? ''),
    updatedAt: Number(payload.updatedAt ?? Date.now()),
    version: entity.version,
    syncState: entity.pendingOpId ? 'pending' : 'synced',
  };
}

function localMilestone(
  entity: Awaited<ReturnType<typeof listEntities>>[number],
): MilestonePublic {
  const payload = entity.payload;
  return {
    id: entity.entityId,
    familyId: String(payload.familyId ?? getFamilyRuntimeStore().familyId ?? ''),
    babyId: String(payload.babyId ?? ''),
    title: String(payload.title ?? ''),
    description: typeof payload.description === 'string' ? payload.description : null,
    happenedAt: Number(payload.happenedAt ?? 0),
    timezoneName: String(payload.timezoneName ?? 'Asia/Shanghai'),
    coverMediaId:
      typeof payload.coverMediaId === 'string' ? payload.coverMediaId : null,
    createdBy: String(payload.createdBy ?? getFamilyRuntimeStore().familyId ?? ''),
    createdAt: Number(payload.createdAt ?? payload.happenedAt ?? Date.now()),
    updatedBy: String(payload.updatedBy ?? getFamilyRuntimeStore().familyId ?? ''),
    updatedAt: Number(payload.updatedAt ?? Date.now()),
    version: entity.version,
    syncState: entity.pendingOpId ? 'pending' : 'synced',
  };
}

export function deriveGrowthView(items: GrowthRecordPublic[]): GrowthListResponse {
  const sorted = [...items].sort(
    (a, b) => b.recordedAt - a.recordedAt || b.id.localeCompare(a.id),
  );
  const latest = (field: 'heightCm' | 'weightKg' | 'headCircumferenceCm') => {
    const item = sorted.find((candidate) => candidate[field] != null);
    const value = item?.[field];
    return item && value != null
      ? { recordId: item.id, value, recordedAt: item.recordedAt }
      : null;
  };
  const chronological = [...sorted].reverse();
  const trend = (field: 'heightCm' | 'weightKg' | 'headCircumferenceCm') =>
    chronological.flatMap((item) => {
      const value = item[field];
      return value == null
        ? []
        : [{ recordId: item.id, recordedAt: item.recordedAt, value }];
    });
  return {
    items: sorted,
    latest: {
      height: latest('heightCm'),
      weight: latest('weightKg'),
      head: latest('headCircumferenceCm'),
    },
    trends: {
      height: trend('heightCm'),
      weight: trend('weightKg'),
      head: trend('headCircumferenceCm'),
    },
  };
}

async function cacheServerGrowth(items: GrowthRecordPublic[]) {
  for (const item of items) {
    const local = await getEntity('GROWTH_RECORD', item.id);
    if (local?.pendingOpId) continue;
    await putEntity({
      entityType: 'GROWTH_RECORD',
      entityId: item.id,
      version: item.version,
      deleted: false,
      payload: item,
      pendingOpId: null,
    });
  }
}

async function cacheServerMilestones(items: MilestonePublic[]) {
  for (const item of items) {
    const local = await getEntity('MILESTONE', item.id);
    if (local?.pendingOpId) continue;
    await putEntity({
      entityType: 'MILESTONE',
      entityId: item.id,
      version: item.version,
      deleted: false,
      payload: item,
      pendingOpId: null,
    });
  }
}

export function useGrowthQuery(babyId: string | null) {
  return useQuery({
    queryKey: growthQueryKey(babyId ?? ''),
    enabled: Boolean(babyId),
    staleTime: 30_000,
    queryFn: async () => {
      const server = await fetchGrowth(babyId!).catch(() => null);
      if (server) await cacheServerGrowth(server.items);
      await recoverPendingEntities(['GROWTH_RECORD']);
      const local = (await listEntities('GROWTH_RECORD'))
        .filter((entity) => !entity.deleted && entity.payload.babyId === babyId)
        .map(localGrowth);
      const byId = new Map((server?.items ?? []).map((item) => [item.id, item]));
      for (const item of local) {
        if (item.syncState === 'pending' || !byId.has(item.id)) byId.set(item.id, item);
      }
      return deriveGrowthView([...byId.values()]);
    },
  });
}

export function useGrowthDetailQuery(id: string | null) {
  return useQuery({
    queryKey: growthDetailQueryKey(id ?? ''),
    enabled: Boolean(id),
    queryFn: async () => {
      await recoverPendingEntities(['GROWTH_RECORD']);
      const local = await getEntity('GROWTH_RECORD', id!);
      if (local?.deleted) throw new Error('这笔成长记录已移到最近删除');
      if (local?.pendingOpId) return localGrowth(local);
      const server = await fetchGrowthDetail(id!).catch(() => null);
      if (server) {
        await cacheServerGrowth([server]);
        return server;
      }
      if (local) return localGrowth(local);
      throw new Error('这笔成长记录还没找到');
    },
  });
}

export function useMilestonesQuery(babyId: string | null) {
  return useQuery({
    queryKey: milestoneQueryKey(babyId ?? ''),
    enabled: Boolean(babyId),
    staleTime: 30_000,
    queryFn: async () => {
      const server = await fetchMilestones(babyId!).catch(() => null);
      if (server) await cacheServerMilestones(server.items);
      await recoverPendingEntities(['MILESTONE']);
      const local = (await listEntities('MILESTONE'))
        .filter((entity) => !entity.deleted && entity.payload.babyId === babyId)
        .map(localMilestone);
      const byId = new Map((server?.items ?? []).map((item) => [item.id, item]));
      for (const item of local) {
        if (item.syncState === 'pending' || !byId.has(item.id)) byId.set(item.id, item);
      }
      return { items: [...byId.values()].sort((a, b) => b.happenedAt - a.happenedAt) };
    },
  });
}

export function useMilestoneDetailQuery(id: string | null) {
  return useQuery({
    queryKey: milestoneDetailQueryKey(id ?? ''),
    enabled: Boolean(id),
    queryFn: async () => {
      await recoverPendingEntities(['MILESTONE']);
      const local = await getEntity('MILESTONE', id!);
      if (local?.deleted) throw new Error('这个里程碑已移到最近删除');
      if (local?.pendingOpId) return localMilestone(local);
      const server = await fetchMilestoneDetail(id!).catch(() => null);
      if (server) {
        await cacheServerMilestones([server]);
        return server;
      }
      if (local) return localMilestone(local);
      throw new Error('这个里程碑还没找到');
    },
  });
}

export function deriveMonthlyStory(
  month: string,
  babyName: string,
  growthItems: GrowthRecordPublic[],
  milestoneItems: MilestonePublic[],
): MonthlyStoryResponse {
  const monthOf = (timestamp: number) => {
    const date = new Date(timestamp);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  };
  const growth = growthItems
    .filter((item) => monthOf(item.recordedAt) === month)
    .sort((a, b) => a.recordedAt - b.recordedAt || a.id.localeCompare(b.id));
  const milestones = milestoneItems
    .filter((item) => monthOf(item.happenedAt) === month)
    .sort((a, b) => a.happenedAt - b.happenedAt || a.id.localeCompare(b.id));
  const change = (
    metric: MonthlyMetricChange['metric'],
    field: 'heightCm' | 'weightKg' | 'headCircumferenceCm',
    unit: MonthlyMetricChange['unit'],
  ): MonthlyMetricChange | null => {
    const values = growth.flatMap((item) => {
      const value = item[field];
      return value == null ? [] : [value];
    });
    if (values.length === 0) return null;
    const first = values[0]!;
    const latest = values[values.length - 1]!;
    return {
      metric,
      first,
      latest,
      delta: Number((latest - first).toFixed(2)),
      unit,
    };
  };
  const changes = [
    change('height', 'heightCm', 'cm'),
    change('weight', 'weightKg', 'kg'),
    change('head', 'headCircumferenceCm', 'cm'),
  ].filter((item): item is MonthlyMetricChange => item !== null);
  const facts: string[] = [];
  if (growth.length > 0) facts.push(`留下了 ${growth.length} 次成长测量`);
  if (milestones.length > 0) facts.push(`收藏了 ${milestones.length} 个第一次`);
  for (const item of changes.filter((candidate) => candidate.delta !== 0)) {
    const label =
      item.metric === 'height' ? '身高' : item.metric === 'weight' ? '体重' : '头围';
    facts.push(`${label}从 ${item.first}${item.unit} 来到 ${item.latest}${item.unit}`);
  }

  return {
    month,
    title: `这个月的${babyName}`,
    summary:
      facts.length > 0
        ? `${facts.join('，')}。每一点变化，都被家人好好接住了。`
        : '这个月还留着一页空白，等下一次测量或新的第一次慢慢写进来。',
    growthRecordCount: growth.length,
    milestoneCount: milestones.length,
    changes,
    milestones,
  };
}

async function monthlyStorySources(babyId: string) {
  const [serverGrowth, serverMilestones] = await Promise.all([
    fetchGrowth(babyId).catch(() => null),
    fetchMilestones(babyId).catch(() => null),
  ]);
  if (serverGrowth) await cacheServerGrowth(serverGrowth.items);
  if (serverMilestones) await cacheServerMilestones(serverMilestones.items);
  await recoverPendingEntities(['GROWTH_RECORD', 'MILESTONE']);

  const [localGrowthItems, localMilestoneItems, pending] = await Promise.all([
    listEntities('GROWTH_RECORD'),
    listEntities('MILESTONE'),
    loadPendingOperations(),
  ]);
  const pendingIds = new Set(
    pending.map((operation) => `${operation.entityType}:${operation.entityId}`),
  );
  const mergeGrowth = new Map(
    (serverGrowth?.items ?? []).map((item) => [item.id, item]),
  );
  for (const entity of localGrowthItems.filter(
    (item) => item.payload.babyId === babyId,
  )) {
    const pendingLocal = pendingIds.has(`GROWTH_RECORD:${entity.entityId}`);
    if (entity.deleted) {
      if (pendingLocal || !serverGrowth) mergeGrowth.delete(entity.entityId);
    } else if (pendingLocal || !serverGrowth) {
      mergeGrowth.set(entity.entityId, localGrowth(entity));
    }
  }
  const mergeMilestones = new Map(
    (serverMilestones?.items ?? []).map((item) => [item.id, item]),
  );
  for (const entity of localMilestoneItems.filter(
    (item) => item.payload.babyId === babyId,
  )) {
    const pendingLocal = pendingIds.has(`MILESTONE:${entity.entityId}`);
    if (entity.deleted) {
      if (pendingLocal || !serverMilestones) mergeMilestones.delete(entity.entityId);
    } else if (pendingLocal || !serverMilestones) {
      mergeMilestones.set(entity.entityId, localMilestone(entity));
    }
  }

  return {
    growth: [...mergeGrowth.values()],
    milestones: [...mergeMilestones.values()],
  };
}

export function useMonthlyStoryQuery(
  babyId: string | null,
  month: string,
  babyName = '宝宝',
) {
  return useQuery({
    queryKey: [...monthlyStoryQueryKey(babyId ?? '', month), babyName],
    enabled: Boolean(babyId && month),
    staleTime: 30_000,
    queryFn: async () => {
      const sources = await monthlyStorySources(babyId!);
      return deriveMonthlyStory(month, babyName, sources.growth, sources.milestones);
    },
  });
}

export function useGrowthActions(babyId: string | null) {
  const queryClient = useQueryClient();
  const syncNow = getSyncNow();

  async function refresh(id?: string) {
    await queryClient.invalidateQueries({ queryKey: ['growth'] });
    await queryClient.invalidateQueries({ queryKey: ['growth-monthly-story'] });
    if (id) await queryClient.invalidateQueries({ queryKey: growthDetailQueryKey(id) });
    if (babyId) void syncNow?.();
  }

  return {
    save: async (values: CreateGrowthBody, current?: GrowthRecordPublic) => {
      const body = createGrowthBodySchema.parse(values);
      const payload = {
        ...body,
        babyId: current?.babyId ?? babyId!,
        timezoneName: body.timezoneName ?? 'Asia/Shanghai',
      };
      const result = current
        ? await updateRecordLocally('GROWTH_RECORD', current.id, payload, {
            baseVersion: current.version,
          })
        : await createRecordLocally('GROWTH_RECORD', payload);
      await refresh(result.entityId);
      return result;
    },
    remove: async (item: GrowthRecordPublic) => {
      const result = await deleteRecordLocally('GROWTH_RECORD', item.id);
      await refresh(item.id);
      return result;
    },
    restore: async (item: GrowthRecordPublic) => {
      const result = await restoreRecordLocally('GROWTH_RECORD', item.id);
      await refresh(item.id);
      return result;
    },
  };
}

export function useMilestoneActions(babyId: string | null) {
  const queryClient = useQueryClient();
  const syncNow = getSyncNow();

  async function refresh(id?: string) {
    await queryClient.invalidateQueries({ queryKey: ['milestones'] });
    await queryClient.invalidateQueries({ queryKey: ['growth-monthly-story'] });
    if (id)
      await queryClient.invalidateQueries({ queryKey: milestoneDetailQueryKey(id) });
    if (babyId) void syncNow?.();
  }

  return {
    save: async (values: CreateMilestoneBody, current?: MilestonePublic) => {
      const body = createMilestoneBodySchema.parse(values);
      const payload = {
        ...body,
        babyId: current?.babyId ?? babyId!,
        timezoneName: body.timezoneName ?? 'Asia/Shanghai',
      };
      const result = current
        ? await updateRecordLocally('MILESTONE', current.id, payload, {
            baseVersion: current.version,
          })
        : await createRecordLocally('MILESTONE', payload);
      await refresh(result.entityId);
      return result;
    },
    remove: async (item: MilestonePublic) => {
      const result = await deleteRecordLocally('MILESTONE', item.id);
      await refresh(item.id);
      return result;
    },
    restore: async (item: MilestonePublic) => {
      const result = await restoreRecordLocally('MILESTONE', item.id);
      await refresh(item.id);
      return result;
    },
  };
}

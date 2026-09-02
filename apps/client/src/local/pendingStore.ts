import { platformAdapters } from '@/adapters/platform';
import type { PendingOperation } from '@runew/contracts';

// Pending 队列持久化在平台存储（H5 IndexedDB 兜底 / 小程序 Taro Storage），
// App 被杀后重启必须完整恢复。operationId 是幂等键，数组顺序即拓扑顺序。
const QUEUE_KEY = 'runew_pending_operations';

export async function loadPendingOperations(): Promise<PendingOperation[]> {
  const raw = await platformAdapters.storage.getItem(QUEUE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as PendingOperation[]) : [];
  } catch {
    return [];
  }
}

export async function savePendingOperations(operations: PendingOperation[]): Promise<void> {
  await platformAdapters.storage.setItem(QUEUE_KEY, JSON.stringify(operations));
}

export async function enqueuePendingOperation(operation: PendingOperation): Promise<void> {
  const operations = await loadPendingOperations();
  if (operations.some((existing) => existing.operationId === operation.operationId)) {
    return;
  }
  operations.push(operation);
  await savePendingOperations(operations);
}

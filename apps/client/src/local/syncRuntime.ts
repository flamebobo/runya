import type { SyncConflictInfo } from '@runew/contracts';
import { useSyncRuntimeStore } from '@/stores/runtime';

// 同步运行时助手：让 local/ 层不直接依赖 React 组件树，同时复用 zustand store。
export function getSyncRuntimeStore() {
  return useSyncRuntimeStore.getState();
}

export function pushConflictInfo(conflict: SyncConflictInfo) {
  useSyncRuntimeStore.getState().pushConflict(conflict);
}

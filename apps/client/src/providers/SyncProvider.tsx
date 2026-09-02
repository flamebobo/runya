import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { PropsWithChildren } from 'react';
import Taro from '@tarojs/taro';
import { platformAdapters } from '@/adapters/platform';
import { useFamilyRuntimeStore, useSyncRuntimeStore } from '@/stores/runtime';
import { getPendingCount, runSyncCycle } from '@/local/syncEngine';
import { setSyncNowBridge } from '@/hooks/useSyncNowBridge';

const POLL_INTERVAL_MS = 20_000;

interface SyncContextValue {
  syncNow: () => void;
}

const SyncContext = createContext<SyncContextValue>({ syncNow: () => undefined });

export function useSyncNow() {
  return useContext(SyncContext).syncNow;
}

// 前台 pull + polling fallback（Tech Design §27.4 的最低要求）。
// WebSocket sync_hint 不在本里程碑范围；断线用 20s 轮询兜底。
export function SyncProvider({ children }: PropsWithChildren) {
  const familyId = useFamilyRuntimeStore((state) => state.familyId);
  const setPendingCount = useSyncRuntimeStore((state) => state.setPendingCount);
  const [tick, setTick] = useState(0);
  const familyIdRef = useRef(familyId);
  familyIdRef.current = familyId;

  const syncNow = useCallback(() => setTick((value) => value + 1), []);

  useEffect(() => {
    setSyncNowBridge(syncNow);
    return () => setSyncNowBridge(() => undefined);
  }, [syncNow]);

  useEffect(() => {
    if (!familyId) return;
    void runSyncCycle(familyId);
  }, [familyId, tick]);

  useEffect(() => {
    if (!familyId) return;
    const timer = setInterval(() => {
      void runSyncCycle(familyId);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [familyId]);

  useEffect(() => {
    if (!familyId) return;
    const unsubscribe = platformAdapters.network.onStatusChange((online) => {
      if (online) {
        void runSyncCycle(familyIdRef.current ?? familyId);
      }
    });
    return unsubscribe;
  }, [familyId]);

  useEffect(() => {
    // 小程序/H5 回前台立即 pull。
    const handler = () => {
      if (familyIdRef.current) void runSyncCycle(familyIdRef.current);
    };
    Taro.onAppShow?.(handler);
    return () => Taro.offAppShow?.(handler);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (cancelled) return;
      setPendingCount(await getPendingCount());
    })();
    return () => {
      cancelled = true;
    };
  }, [setPendingCount, tick]);

  const value = useMemo(() => ({ syncNow }), [syncNow]);
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

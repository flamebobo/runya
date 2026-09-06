import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { PropsWithChildren } from 'react';
import Taro from '@tarojs/taro';
import { platformAdapters } from '@/adapters/platform';
import { useFamilyRuntimeStore, useSyncRuntimeStore } from '@/stores/runtime';
import { getPendingCount, runSyncCycle } from '@/local/syncEngine';
import { openRealtimeChannel, type RealtimeChannel } from '@/local/realtime';
import { setSyncNowBridge } from '@/hooks/useSyncNowBridge';
import { persistWeappSession } from '@/api/client';

const POLL_INTERVAL_MS = 20_000;
const REALTIME_RECONNECT_MS = 10_000;

interface SyncContextValue {
  syncNow: () => void;
}

const SyncContext = createContext<SyncContextValue>({ syncNow: () => undefined });

export function useSyncNow() {
  return useContext(SyncContext).syncNow;
}

// 前台 pull + polling fallback（Tech Design §27.4）。实时通道只负责提示，
// 数据仍由既有 sync cycle 拉取，避免把 PRIVATE body 放进长连接。
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
    let cancelled = false;
    let opening = false;
    let channel: RealtimeChannel | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    const scheduleReconnect = () => {
      if (cancelled || reconnectTimer !== undefined) return;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = undefined;
        void connect();
      }, REALTIME_RECONNECT_MS);
    };

    const connect = async () => {
      if (cancelled || opening || channel) return;
      opening = true;
      try {
        const nextChannel = await openRealtimeChannel({
          familyId,
          onEvent: (event) => {
            if (event.type === 'session_revoked') {
              persistWeappSession(null);
              void Taro.reLaunch({ url: '/pages/auth/login/index' });
              return;
            }
            if (
              (event.type === 'sync_hint' || event.type === 'notification_hint') &&
              (!event.familyId || event.familyId === familyIdRef.current)
            ) {
              syncNow();
            }
          },
          onClose: () => {
            channel = null;
            scheduleReconnect();
          },
        });
        if (cancelled) {
          nextChannel?.close();
          return;
        }
        channel = nextChannel;
        if (!channel) scheduleReconnect();
      } catch {
        scheduleReconnect();
      } finally {
        opening = false;
      }
    };

    void connect();
    return () => {
      cancelled = true;
      if (reconnectTimer !== undefined) clearTimeout(reconnectTimer);
      channel?.close();
      channel = null;
    };
  }, [familyId, syncNow]);

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

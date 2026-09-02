import { create } from 'zustand';
import type { BottomNavKey } from '@runew/domain-types';
import type {
  RecordPayload,
  SyncConflictInfo,
  SyncEntityType,
} from '@runew/contracts';

interface AuthRuntimeState {
  userId: string | null;
  isAuthenticated: boolean;
  setUserId: (userId: string | null) => void;
}

interface FamilyRuntimeState {
  familyId: string | null;
  babyId: string | null;
  setFamilyId: (familyId: string | null) => void;
  setBabyId: (babyId: string | null) => void;
}

interface UiOverlayState {
  drawerOpen: boolean;
  bottomNavActive: BottomNavKey | null;
  toastMessage: string | null;
  sheetOpen: boolean;
  dialogOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  setBottomNavActive: (key: BottomNavKey | null) => void;
  showToast: (message: string) => void;
  clearToast: () => void;
  setSheetOpen: (open: boolean) => void;
  setDialogOpen: (open: boolean) => void;
}

interface ThemeState {
  theme: 'day' | 'night';
  reduceMotion: boolean;
  setTheme: (theme: 'day' | 'night') => void;
  setReduceMotion: (reduceMotion: boolean) => void;
}

export const useAuthRuntimeStore = create<AuthRuntimeState>((set) => ({
  userId: null,
  isAuthenticated: false,
  setUserId: (userId) => set({ userId, isAuthenticated: Boolean(userId) }),
}));

export const useFamilyRuntimeStore = create<FamilyRuntimeState>((set) => ({
  familyId: null,
  babyId: null,
  setFamilyId: (familyId) => set({ familyId }),
  setBabyId: (babyId) => set({ babyId }),
}));

// 非 React 层（local repository / syncEngine）读取当前家庭上下文用。
export function getFamilyRuntimeStore() {
  return useFamilyRuntimeStore.getState();
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export const useUiOverlayStore = create<UiOverlayState>((set) => ({
  drawerOpen: false,
  bottomNavActive: 'today',
  toastMessage: null,
  sheetOpen: false,
  dialogOpen: false,
  setDrawerOpen: (drawerOpen) => set({ drawerOpen }),
  setBottomNavActive: (bottomNavActive) => set({ bottomNavActive }),
  showToast: (toastMessage) => {
    if (toastTimer) clearTimeout(toastTimer);
    set({ toastMessage });
    toastTimer = setTimeout(() => {
      set({ toastMessage: null });
    }, 2400);
  },
  clearToast: () => {
    if (toastTimer) clearTimeout(toastTimer);
    set({ toastMessage: null });
  },
  setSheetOpen: (sheetOpen) => set({ sheetOpen }),
  setDialogOpen: (dialogOpen) => set({ dialogOpen }),
}));

export const useThemeStore = create<ThemeState>((set) => ({
  theme: 'day',
  reduceMotion: false,
  setTheme: (theme) => set({ theme }),
  setReduceMotion: (reduceMotion) => set({ reduceMotion }),
}));

// 同步状态只放「UI 需要的展示态」；实体数据在本地库，列表数据在 TanStack Query。
export type SyncPhase = 'idle' | 'syncing' | 'offline' | 'error';

export interface SyncDeletionNotice {
  operationId: string;
  entityType: SyncEntityType;
  entityId: string;
  serverVersion: number;
  clientPatch: RecordPayload;
  serverSnapshot: RecordPayload;
}

export interface SyncRuntimeState {
  phase: SyncPhase;
  pendingCount: number;
  lastSyncedAt: number | null;
  conflicts: SyncConflictInfo[];
  duplicateCount: number;
  deletionNotice: SyncDeletionNotice | null;
  setPhase: (phase: SyncPhase) => void;
  setPendingCount: (count: number) => void;
  setLastSyncedAt: (at: number | null) => void;
  pushConflict: (conflict: SyncConflictInfo) => void;
  resolveConflict: (operationId: string) => void;
  setDuplicateCount: (count: number) => void;
  setDeletionNotice: (notice: SyncDeletionNotice | null) => void;
}

export const useSyncRuntimeStore = create<SyncRuntimeState>((set) => ({
  phase: 'idle',
  pendingCount: 0,
  lastSyncedAt: null,
  conflicts: [],
  duplicateCount: 0,
  deletionNotice: null,
  setPhase: (phase) => set({ phase }),
  setPendingCount: (pendingCount) => set({ pendingCount }),
  setLastSyncedAt: (lastSyncedAt) => set({ lastSyncedAt }),
  pushConflict: (conflict) =>
    set((state) =>
      state.conflicts.some((existing) => existing.operationId === conflict.operationId)
        ? state
        : { conflicts: [...state.conflicts, conflict] },
    ),
  resolveConflict: (operationId) =>
    set((state) => ({
      conflicts: state.conflicts.filter((existing) => existing.operationId !== operationId),
    })),
  setDuplicateCount: (duplicateCount) => set({ duplicateCount }),
  setDeletionNotice: (deletionNotice) => set({ deletionNotice }),
}));

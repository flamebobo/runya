import { create } from 'zustand';
import type { BottomNavKey } from '@runew/domain-types';

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

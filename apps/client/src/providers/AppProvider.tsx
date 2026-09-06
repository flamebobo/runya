import type { PropsWithChildren } from 'react';
import { useEffect, useMemo } from 'react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { platformAdapters } from '@/adapters/platform';
import { useAuthRuntimeStore, useThemeStore } from '@/stores/runtime';
import { fetchUserSettings } from '@/api/m11';
import { ErrorBoundary } from './ErrorBoundary';
import { OverlayRoot } from './OverlayRoot';
import { SyncProvider } from './SyncProvider';
import { ThemeProvider } from './ThemeProvider';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

export function AppProvider({ children }: PropsWithChildren) {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AppRuntime>{children}</AppRuntime>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

function AppRuntime({ children }: PropsWithChildren) {
  const reduceMotion = useThemeStore((state) => state.reduceMotion);
  const setTheme = useThemeStore((state) => state.setTheme);
  const isAuthenticated = useAuthRuntimeStore((state) => state.isAuthenticated);
  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: fetchUserSettings,
    enabled: isAuthenticated,
    retry: false,
  });

  useEffect(() => {
    if (!settingsQuery.data) return;
    setTheme(settingsQuery.data.appearance === 'NIGHT' ? 'night' : 'day');
  }, [settingsQuery.data, setTheme]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!media) return;
    useThemeStore.getState().setReduceMotion(media.matches);
    const handler = (event: MediaQueryListEvent) => {
      useThemeStore.getState().setReduceMotion(event.matches);
    };
    media.addEventListener('change', handler);
    return () => media.removeEventListener('change', handler);
  }, [reduceMotion]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.classList.toggle('reduce-motion', reduceMotion);
  }, [reduceMotion]);

  const adapters = useMemo(() => platformAdapters, []);

  return (
    <>
      <ThemeProvider adapters={adapters}>
        <SyncProvider>{children}</SyncProvider>
      </ThemeProvider>
      <OverlayRoot />
    </>
  );
}

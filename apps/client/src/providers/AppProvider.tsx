import type { PropsWithChildren } from 'react';
import { useEffect, useMemo } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { platformAdapters } from '@/adapters/platform';
import { useThemeStore } from '@/stores/runtime';
import { ErrorBoundary } from './ErrorBoundary';
import { OverlayRoot } from './OverlayRoot';
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
  const reduceMotion = useThemeStore((state) => state.reduceMotion);

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!media) return;
    useThemeStore.getState().setReduceMotion(media.matches);
    const handler = (event: MediaQueryListEvent) => {
      useThemeStore.getState().setReduceMotion(event.matches);
    };
    media.addEventListener('change', handler);
    return () => media.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('reduce-motion', reduceMotion);
  }, [reduceMotion]);

  const adapters = useMemo(() => platformAdapters, []);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider adapters={adapters}>{children}</ThemeProvider>
        <OverlayRoot />
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

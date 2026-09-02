import { createContext, useContext, useEffect, type PropsWithChildren } from 'react';
import type { PlatformAdapters } from '@/adapters/types';
import { useThemeStore } from '@/stores/runtime';

const ThemeContext = createContext<PlatformAdapters | null>(null);

interface ThemeProviderProps extends PropsWithChildren {
  adapters: PlatformAdapters;
}

export function ThemeProvider({ adapters, children }: ThemeProviderProps) {
  const theme = useThemeStore((state) => state.theme);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return <ThemeContext.Provider value={adapters}>{children}</ThemeContext.Provider>;
}

export function usePlatformAdapters() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('usePlatformAdapters must be used within ThemeProvider');
  }
  return context;
}

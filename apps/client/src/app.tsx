import type { PropsWithChildren } from 'react';
import { useEffect } from 'react';
import { useLaunch } from '@tarojs/taro';
import { AppProvider } from '@/providers/AppProvider';
import './app.scss';

function App({ children }: PropsWithChildren) {
  useLaunch(() => {
    console.log('RUNEW app launched');
  });

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.classList.add('runew-app');
    return () => {
      document.documentElement.classList.remove('runew-app');
    };
  }, []);

  return <AppProvider>{children}</AppProvider>;
}

export default App;

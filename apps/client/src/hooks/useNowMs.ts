import { useEffect, useState } from 'react';
import Taro from '@tarojs/taro';

export function useNowMs(enabled: boolean) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled) return;

    const tick = () => setNow(Date.now());
    tick();
    const timer = setInterval(tick, 1000);

    const onShow = () => tick();
    Taro.onAppShow?.(onShow);
    const doc = typeof document === 'undefined' ? null : document;
    doc?.addEventListener('visibilitychange', onShow);

    return () => {
      clearInterval(timer);
      Taro.offAppShow?.(onShow);
      doc?.removeEventListener('visibilitychange', onShow);
    };
  }, [enabled]);

  return now;
}

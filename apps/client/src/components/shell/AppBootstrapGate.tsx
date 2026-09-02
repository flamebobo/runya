import { useEffect } from 'react';
import Taro from '@tarojs/taro';
import { ApiError } from '@/api/client';
import { isBootstrapReady, needsOnboarding, useBootstrapQuery } from '@/hooks/useBootstrap';
import { ErrorState, Skeleton } from '@/components/feedback';

interface AppBootstrapGateProps {
  children: React.ReactNode;
}

export function AppBootstrapGate({ children }: AppBootstrapGateProps) {
  const query = useBootstrapQuery();

  useEffect(() => {
    if (!query.isError) return;
    const error = query.error;
    if (error instanceof ApiError) {
      if (
        error.code === 'AUTH_REQUIRED' ||
        error.code === 'AUTH_SESSION_EXPIRED' ||
        error.code === 'AUTH_SESSION_REVOKED'
      ) {
        void Taro.reLaunch({ url: '/pages/auth/login/index' });
      }
    }
  }, [query.isError, query.error]);

  useEffect(() => {
    if (!query.data) return;
    if (needsOnboarding(query.data)) {
      void Taro.reLaunch({ url: '/pages/onboarding/index' });
    }
  }, [query.data]);

  if (query.isLoading) {
    return <Skeleton lines={6} />;
  }

  if (query.isError) {
    return (
      <ErrorState
        title="暂时连不上润芽"
        description={query.error instanceof Error ? query.error.message : '请稍后再试'}
        onRetry={() => void query.refetch()}
      />
    );
  }

  if (!isBootstrapReady(query.data)) {
    return <Skeleton lines={6} />;
  }

  return <>{children}</>;
}

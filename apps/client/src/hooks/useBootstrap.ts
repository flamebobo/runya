import { useQuery } from '@tanstack/react-query';
import type { BootstrapResponse } from '@runew/contracts';
import { fetchBootstrap } from '@/api/auth';
import { useAuthRuntimeStore, useFamilyRuntimeStore } from '@/stores/runtime';

export const bootstrapQueryKey = ['bootstrap'] as const;

export function useBootstrapQuery(enabled = true) {
  const setUserId = useAuthRuntimeStore((state) => state.setUserId);
  const setFamilyId = useFamilyRuntimeStore((state) => state.setFamilyId);
  const setBabyId = useFamilyRuntimeStore((state) => state.setBabyId);

  return useQuery({
    queryKey: bootstrapQueryKey,
    enabled,
    queryFn: async () => {
      const data = await fetchBootstrap();
      setUserId(data.user.id);
      setFamilyId(data.currentFamily?.id ?? null);
      setBabyId(data.currentBaby?.id ?? null);
      return data;
    },
  });
}

export function isBootstrapReady(data: BootstrapResponse | undefined) {
  return data?.status === 'READY';
}

export function needsOnboarding(data: BootstrapResponse | undefined) {
  return data?.status === 'MISSING_FAMILY' || data?.status === 'MISSING_BABY';
}

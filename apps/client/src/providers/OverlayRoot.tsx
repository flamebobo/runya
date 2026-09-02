import { Toast } from '@/components/feedback';
import { SyncHost } from '@/components/sync/SyncHost';

export function OverlayRoot() {
  return (
    <>
      <Toast />
      <SyncHost />
    </>
  );
}

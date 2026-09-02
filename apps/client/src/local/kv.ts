import { platformAdapters } from '@/adapters/platform';

// 单键 KV（设备号、sync cursor、sync epoch）。禁止把实体数据塞进这里。
export async function kvGet(key: string): Promise<string | null> {
  return platformAdapters.storage.getItem(key);
}

export async function kvSet(key: string, value: string): Promise<void> {
  await platformAdapters.storage.setItem(key, value);
}

export async function kvRemove(key: string): Promise<void> {
  await platformAdapters.storage.removeItem(key);
}

export const KV_KEYS = {
  DEVICE_ID: 'runew_device_id',
  SYNC_CURSOR: 'runew_sync_cursor',
  SYNC_EPOCH: 'runew_sync_epoch',
} as const;

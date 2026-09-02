import { KV_KEYS, kvGet, kvSet } from './kv';

// cursor 保存的是「已消费到的 sync_operations seq」，epoch 来自服务端。
// epoch 变化 → cursor 作废 → full resync。
export async function getSyncCursor(): Promise<number> {
  const raw = await kvGet(KV_KEYS.SYNC_CURSOR);
  const value = raw ? Number.parseInt(raw, 10) : 0;
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

export async function setSyncCursor(cursor: number): Promise<void> {
  await kvSet(KV_KEYS.SYNC_CURSOR, String(cursor));
}

export async function getSyncEpoch(): Promise<number> {
  const raw = await kvGet(KV_KEYS.SYNC_EPOCH);
  const value = raw ? Number.parseInt(raw, 10) : 0;
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

export async function setSyncEpoch(epoch: number): Promise<void> {
  await kvSet(KV_KEYS.SYNC_EPOCH, String(epoch));
}

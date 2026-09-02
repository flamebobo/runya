import { KV_KEYS, kvGet, kvSet } from './kv';
import { createUlid } from '@runew/shared-utils';

// 设备号在本地生成一次，此后跟随该浏览器/小程序安装。
// push 时与服务端 device 心跳无关，只用于日志归因。
export async function getOrCreateDeviceId(): Promise<string> {
  const existing = await kvGet(KV_KEYS.DEVICE_ID);
  if (existing) return existing;
  const deviceId = createUlid();
  await kvSet(KV_KEYS.DEVICE_ID, deviceId);
  return deviceId;
}

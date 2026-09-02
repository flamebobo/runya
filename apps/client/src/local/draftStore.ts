import { platformAdapters } from '@/adapters/platform';

// 表单草稿：长文本内容在用户离开/杀 App 后可恢复（AGENTS §53）。
// 只存草稿本身，不存储业务真相；提交成功后清除。
const PREFIX = 'runew_draft_';

export async function saveDraft(key: string, value: Record<string, unknown>): Promise<void> {
  await platformAdapters.storage.setItem(`${PREFIX}${key}`, JSON.stringify({ value, savedAt: Date.now() }));
}

export async function loadDraft(key: string): Promise<Record<string, unknown> | null> {
  const raw = await platformAdapters.storage.getItem(`${PREFIX}${key}`);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { value?: Record<string, unknown> };
    return parsed.value ?? null;
  } catch {
    return null;
  }
}

export async function clearDraft(key: string): Promise<void> {
  await platformAdapters.storage.removeItem(`${PREFIX}${key}`);
}

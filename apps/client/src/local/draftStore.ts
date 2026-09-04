import { platformAdapters } from '@/adapters/platform';

// 草稿只保存表單暫存，不保存業務真相；提交成功後由呼叫方清除。
const PREFIX = 'runew_draft_';

export interface DraftRecord {
  value: Record<string, unknown>;
  savedAt: number;
  baseVersion?: number;
}

export interface DraftMetadata {
  baseVersion?: number;
}

function normalizeDraft(parsed: unknown): DraftRecord | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const envelope = parsed as {
    value?: unknown;
    savedAt?: unknown;
    baseVersion?: unknown;
  };
  if (!envelope.value || typeof envelope.value !== 'object' || Array.isArray(envelope.value)) {
    return null;
  }

  const rawValue = envelope.value as Record<string, unknown>;
  const value = { ...rawValue };
  const legacyBaseVersion = value.baseVersion;
  const legacySavedAt = value.savedAt;
  delete value.baseVersion;
  delete value.savedAt;

  const baseVersion =
    typeof envelope.baseVersion === 'number'
      ? envelope.baseVersion
      : typeof legacyBaseVersion === 'number'
        ? legacyBaseVersion
        : undefined;
  const savedAt =
    typeof envelope.savedAt === 'number'
      ? envelope.savedAt
      : typeof legacySavedAt === 'number'
        ? legacySavedAt
        : Date.now();

  return { value, savedAt, ...(baseVersion === undefined ? {} : { baseVersion }) };
}

export async function saveDraft(
  key: string,
  value: Record<string, unknown>,
  metadata: DraftMetadata = {},
): Promise<void> {
  await platformAdapters.storage.setItem(
    `${PREFIX}${key}`,
    JSON.stringify({
      value,
      savedAt: Date.now(),
      ...(metadata.baseVersion === undefined ? {} : { baseVersion: metadata.baseVersion }),
    }),
  );
}

// 保留既有 Memories 等调用者的 value-only 相容接口。
export async function loadDraft(key: string): Promise<Record<string, unknown> | null> {
  const record = await loadDraftRecord(key);
  return record?.value ?? null;
}

export async function loadDraftRecord(key: string): Promise<DraftRecord | null> {
  const raw = await platformAdapters.storage.getItem(`${PREFIX}${key}`);
  if (!raw) return null;
  try {
    return normalizeDraft(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function clearDraft(key: string): Promise<void> {
  await platformAdapters.storage.removeItem(`${PREFIX}${key}`);
}

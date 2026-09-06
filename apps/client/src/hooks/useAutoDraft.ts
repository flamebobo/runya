import { useCallback, useEffect, useMemo, useReducer } from 'react';
import Taro from '@tarojs/taro';
import { clearDraft, loadDraftRecord, saveDraft, type DraftRecord } from '@/local/draftStore';

export const DRAFT_DEBOUNCE_MS = 500;

export interface DraftConflict {
  draftSavedAt: number;
  serverVersion: number;
  baseVersion: number;
}

interface AutoDraftOptions<TValues extends Record<string, unknown>> {
  key: string;
  values: TValues;
  paused?: boolean;
  serverVersion?: number;
}

interface AutoDraftApi<TValues extends Record<string, unknown>> {
  restored: TValues | null;
  pending: TValues | null;
  ready: boolean;
  error: string | null;
  baseVersion: number | undefined;
  conflict: DraftConflict | null;
  recover: () => TValues | null;
  dismissConflict: () => void;
  flush: () => Promise<boolean>;
  clear: () => Promise<void>;
  discard: () => Promise<void>;
}

function valuesSignature(values: Record<string, unknown>) {
  return JSON.stringify(values);
}

/**
 * 統一處理長文字草稿：使用者真正修改後防抖保存，並在失焦、切到後台與離開頁面時補存。
 * 首次掛載只建立比較基線，不把空表單誤存成草稿。
 */
export function useAutoDraft<TValues extends Record<string, unknown>>(
  options: AutoDraftOptions<TValues>,
): AutoDraftApi<TValues> {
  const { key, values, paused = false, serverVersion } = options;
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  // Each editor owns its values and version, including while its cleanup is saving.
  const session = useMemo(() => ({
    values,
    signature: valuesSignature(values),
    baseVersion: serverVersion,
    dirty: false,
    ready: false,
    draft: null as DraftRecord | null,
    restoredSignature: null as string | null,
    error: null as string | null,
    queue: Promise.resolve(),
    cleared: false,
  // Values and serverVersion belong to the opening snapshot, not session identity.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [key, paused]);

  useEffect(() => {
    if (paused) return;
    let cancelled = false;
    session.queue = loadDraftRecord(key).then((draft) => {
      if (!session.cleared) session.draft = draft;
      session.ready = true;
    }).catch(() => {
      session.error = '草稿读取失败，请暂时保留当前页面';
    }).finally(() => {
      if (!cancelled) redraw();
    });
    return () => { cancelled = true; };
  }, [key, paused, session]);

  const writeDraft = useCallback((force = false) => {
    if (paused || session.cleared || (!force && !session.dirty)) return session.queue;
    const snapshot = session.values;
    const signature = session.signature;
    session.queue = session.queue.then(async () => {
      // An undecided stored draft must never be overwritten by server form values.
      if (!session.ready || session.draft || session.cleared) return;
      await saveDraft(key, snapshot, { baseVersion: session.baseVersion });
      if (session.signature === signature) session.dirty = false;
      session.error = null;
      redraw();
    }).catch(() => {
      session.dirty = true;
      session.error = '草稿暂未保存，请保留当前页面并重试';
      redraw();
    });
    return session.queue;
  }, [key, paused, session]);

  const flush = useCallback(async () => {
    await writeDraft(true);
    return session.ready && !session.draft && !session.error;
  }, [session, writeDraft]);
  const flushIfDirty = useCallback(() => writeDraft(), [writeDraft]);

  useEffect(() => {
    if (paused) return;
    const signature = valuesSignature(values);
    session.values = values;
    if (signature !== session.signature) {
      session.signature = signature;
      session.cleared = false;
      if (signature === session.restoredSignature) {
        session.restoredSignature = null;
      } else {
        session.dirty = true;
      }
    }
    if (!session.dirty) return;
    const timer = setTimeout(() => void flushIfDirty(), DRAFT_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [flushIfDirty, paused, session, values]);

  useEffect(() => {
    if (paused || typeof document === 'undefined') return undefined;
    const handler = () => void flushIfDirty();
    const hide = () => { if (document.visibilityState === 'hidden') handler(); };
    document.addEventListener('blur', handler, true);
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('pagehide', handler);
    return () => {
      document.removeEventListener('blur', handler, true);
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('pagehide', handler);
    };
  }, [flushIfDirty, paused]);

  Taro.useDidHide(() => {
    void flushIfDirty();
  });

  useEffect(() => {
    return () => void flushIfDirty();
  }, [flushIfDirty]);

  const clear = useCallback(async () => {
    session.cleared = true;
    session.queue = session.queue.then(() => clearDraft(key));
    try {
      await session.queue;
      session.dirty = false;
      session.draft = null;
      session.restoredSignature = null;
      session.error = null;
      redraw();
    } catch (error) {
      session.cleared = false;
      session.error = '草稿未能清除，请重试';
      session.queue = Promise.resolve();
      redraw();
      throw error;
    }
  }, [key, session]);

  const recover = useCallback(() => {
    const draft = session.draft;
    if (!draft) return null;
    session.baseVersion = draft.baseVersion;
    session.restoredSignature = valuesSignature(draft.value);
    session.draft = null;
    redraw();
    return draft.value as TValues;
  }, [session]);
  const baseVersion = session.draft?.baseVersion ?? session.baseVersion;
  const conflict = serverVersion !== undefined && baseVersion !== undefined && serverVersion !== baseVersion
    ? { baseVersion, serverVersion, draftSavedAt: session.draft?.savedAt ?? Date.now() }
    : null;
  // Dismissing presentation must not remove the version guard.
  const dismissConflict = useCallback(() => undefined, []);

  return {
    restored: conflict ? null : (session.draft?.value as TValues | undefined) ?? null,
    pending: session.draft?.value as TValues | null ?? null,
    ready: session.ready,
    error: session.error,
    baseVersion,
    conflict,
    recover,
    dismissConflict,
    flush,
    clear,
    discard: clear,
  };
}

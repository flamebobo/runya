import { useCallback, useEffect, useRef, useState } from 'react';
import Taro from '@tarojs/taro';
import { clearDraft, loadDraftRecord, saveDraft } from '@/local/draftStore';

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
  conflict: DraftConflict | null;
  dismissConflict: () => void;
  flush: () => Promise<void>;
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
  const [restored, setRestored] = useState<TValues | null>(null);
  const [conflict, setConflict] = useState<DraftConflict | null>(null);
  const valuesRef = useRef(values);
  const dirtyRef = useRef(false);
  const initializedRef = useRef(false);
  const previousSignatureRef = useRef<string | null>(null);
  const restoredSignatureRef = useRef<string | null>(null);
  valuesRef.current = values;

  useEffect(() => {
    if (paused) return;
    let cancelled = false;
    void loadDraftRecord(key).then((draft) => {
      if (cancelled || !draft) return;
      if (
        serverVersion !== undefined &&
        draft.baseVersion !== undefined &&
        draft.baseVersion !== serverVersion
      ) {
        setConflict({
          draftSavedAt: draft.savedAt,
          serverVersion,
          baseVersion: draft.baseVersion,
        });
        return;
      }
      restoredSignatureRef.current = valuesSignature(draft.value);
      setRestored(draft.value as TValues);
    });
    return () => {
      cancelled = true;
    };
  }, [key, paused, serverVersion]);

  const writeDraft = useCallback(async () => {
    dirtyRef.current = false;
    await saveDraft(key, valuesRef.current, { baseVersion: serverVersion }).catch(
      () => {
        dirtyRef.current = true;
      },
    );
  }, [key, serverVersion]);

  const flush = useCallback(async () => {
    if (paused) return;
    await writeDraft();
  }, [paused, writeDraft]);

  const flushIfDirty = useCallback(async () => {
    if (paused || !dirtyRef.current) return;
    await writeDraft();
  }, [paused, writeDraft]);

  useEffect(() => {
    if (paused) return;
    const signature = valuesSignature(values);
    if (!initializedRef.current) {
      initializedRef.current = true;
      previousSignatureRef.current = signature;
      return;
    }
    if (signature === previousSignatureRef.current) return;
    previousSignatureRef.current = signature;
    if (signature === restoredSignatureRef.current) {
      restoredSignatureRef.current = null;
      return;
    }

    dirtyRef.current = true;
    const timer = setTimeout(() => void flushIfDirty(), DRAFT_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [flushIfDirty, paused, values]);

  useEffect(() => {
    if (paused || typeof document === 'undefined') return undefined;
    const handler = () => void flushIfDirty();
    document.addEventListener('blur', handler, true);
    return () => document.removeEventListener('blur', handler, true);
  }, [flushIfDirty, paused]);

  Taro.useDidHide(() => {
    void flushIfDirty();
  });

  useEffect(() => {
    return () => void flushIfDirty();
  }, [flushIfDirty]);

  const clear = useCallback(async () => {
    dirtyRef.current = false;
    restoredSignatureRef.current = null;
    setRestored(null);
    setConflict(null);
    await clearDraft(key).catch(() => undefined);
  }, [key]);

  const dismissConflict = useCallback(() => setConflict(null), []);

  return {
    restored,
    conflict,
    dismissConflict,
    flush,
    clear,
    discard: clear,
  };
}

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAutoDraft } from './useAutoDraft';
import { clearDraft, loadDraftRecord, saveDraft } from '@/local/draftStore';

vi.mock('@/local/draftStore', () => ({
  saveDraft: vi.fn().mockResolvedValue(undefined),
  loadDraftRecord: vi.fn().mockResolvedValue(null),
  clearDraft: vi.fn().mockResolvedValue(undefined),
}));

const mockedLoad = vi.mocked(loadDraftRecord);
const mockedSave = vi.mocked(saveDraft);
const mockedClear = vi.mocked(clearDraft);

function waitDebounce() {
  return new Promise((resolve) => setTimeout(resolve, 700));
}

describe('useAutoDraft', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedLoad.mockResolvedValue(null);
  });

  it('does not save the initial form value as a draft', async () => {
    renderHook(() => useAutoDraft({ key: 'test_draft', values: { body: '' } }));
    await waitDebounce();
    expect(mockedSave).not.toHaveBeenCalled();
  });

  it('debounces value changes into saveDraft with version metadata', async () => {
    const { rerender } = renderHook(
      ({ values }) => useAutoDraft({ key: 'test_draft', values }),
      { initialProps: { values: { body: '第一版' } } },
    );
    rerender({ values: { body: '第二版' } });
    await waitDebounce();
    expect(mockedSave).toHaveBeenCalledWith(
      'test_draft',
      { body: '第二版' },
      { baseVersion: undefined },
    );
  });

  it('restores a saved draft after remount', async () => {
    mockedLoad.mockResolvedValue({
      value: { body: '没写完的话' },
      baseVersion: 1,
      savedAt: 1,
    });
    const { result } = renderHook(() =>
      useAutoDraft({ key: 'test_draft', values: { body: '' } }),
    );
    await waitFor(() => expect(result.current.restored).not.toBeNull());
    expect(result.current.restored?.body).toBe('没写完的话');
  });

  it('reports conflict instead of silently overwriting when baseVersion is stale', async () => {
    mockedLoad.mockResolvedValue({
      value: { body: '旧版本草稿' },
      baseVersion: 1,
      savedAt: 42,
    });
    const { result } = renderHook(() =>
      useAutoDraft({ key: 'test_draft', values: { body: '' }, serverVersion: 3 }),
    );
    await waitFor(() => expect(result.current.conflict).not.toBeNull());
    expect(result.current.conflict).toMatchObject({
      baseVersion: 1,
      serverVersion: 3,
    });
    expect(result.current.restored).toBeNull();
  });

  it('discard removes and hides a restored draft', async () => {
    mockedLoad.mockResolvedValue({
      value: { body: '不想继续的草稿' },
      savedAt: 42,
    });
    const { result } = renderHook(() =>
      useAutoDraft({ key: 'test_draft', values: { body: '' } }),
    );
    await waitFor(() => expect(result.current.restored).not.toBeNull());
    await act(async () => {
      await result.current.discard();
    });
    expect(mockedClear).toHaveBeenCalledWith('test_draft');
    await waitFor(() => expect(result.current.restored).toBeNull());
  });

  it('clear removes the saved draft', async () => {
    const { result } = renderHook(() =>
      useAutoDraft({ key: 'test_draft', values: { body: 'x' } }),
    );
    await result.current.clear();
    expect(mockedClear).toHaveBeenCalledWith('test_draft');
  });

  it('flush writes current values immediately', async () => {
    const { result } = renderHook(() =>
      useAutoDraft({ key: 'test_draft', values: { body: '立刻保存' } }),
    );
    await result.current.flush();
    expect(mockedSave).toHaveBeenCalledWith(
      'test_draft',
      { body: '立刻保存' },
      { baseVersion: undefined },
    );
  });

  it('flushes the old draft values under the old key when switching editors', async () => {
    const { rerender } = renderHook(
      ({ draftKey, body }) => useAutoDraft({ key: draftKey, values: { body } }),
      { initialProps: { draftKey: 'diary_a', body: '原文 A' } },
    );
    rerender({ draftKey: 'diary_a', body: '未写完的 A' });
    rerender({ draftKey: 'diary_b', body: '原文 B' });
    await waitFor(() => expect(mockedSave).toHaveBeenCalledWith('diary_a', { body: '未写完的 A' }, { baseVersion: undefined }));
    expect(mockedSave).not.toHaveBeenCalledWith('diary_a', { body: '原文 B' }, expect.anything());
  });

  it('keeps the editing baseVersion when the server advances', async () => {
    const { result, rerender } = renderHook(
      ({ version, body }) => useAutoDraft({ key: 'diary_a', values: { body }, serverVersion: version }),
      { initialProps: { version: 1, body: '原文' } },
    );
    rerender({ version: 1, body: '我的修改' });
    rerender({ version: 2, body: '我的修改' });
    await act(async () => { await result.current.flush(); });
    expect(mockedSave).toHaveBeenLastCalledWith('diary_a', { body: '我的修改' }, { baseVersion: 1 });
    expect(result.current.conflict).toMatchObject({ baseVersion: 1, serverVersion: 2 });
  });

  it('preserves a conflicting stored draft when untouched server values are flushed', async () => {
    mockedLoad.mockResolvedValue({ value: { body: '旧草稿仍要保留' }, baseVersion: 1, savedAt: 42 });
    const { result } = renderHook(() => useAutoDraft({ key: 'diary_a', values: { body: '服务器新内容' }, serverVersion: 2 }));
    await waitFor(() => expect(result.current.conflict).not.toBeNull());
    await act(async () => { await result.current.flush(); });
    expect(mockedSave).not.toHaveBeenCalled();
  });

  it('flushes unsaved text on blur and route leave', async () => {
    const { rerender, unmount } = renderHook(
      ({ body }) => useAutoDraft({ key: 'diary_a', values: { body } }),
      { initialProps: { body: '' } },
    );
    rerender({ body: '失焦前的文字' });
    act(() => document.dispatchEvent(new Event('blur')));
    await waitFor(() => expect(mockedSave).toHaveBeenCalledWith('diary_a', { body: '失焦前的文字' }, { baseVersion: undefined }));
    rerender({ body: '离开前的文字' });
    unmount();
    await waitFor(() => expect(mockedSave).toHaveBeenLastCalledWith('diary_a', { body: '离开前的文字' }, { baseVersion: undefined }));
  });
});

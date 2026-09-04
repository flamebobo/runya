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
});

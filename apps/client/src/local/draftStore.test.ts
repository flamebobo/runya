import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearDraft, loadDraftRecord, saveDraft } from './draftStore';
import { platformAdapters } from '@/adapters/platform';

vi.mock('@/adapters/platform', () => ({
  platformAdapters: { storage: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() } },
}));

const disk = new Map<string, string>();
const storage = platformAdapters.storage;

describe('draft storage ordering', () => {
  beforeEach(() => {
    disk.clear();
    vi.mocked(storage.getItem).mockImplementation(async (key) => disk.get(key) ?? null);
    vi.mocked(storage.setItem).mockImplementation(async (key, value) => { disk.set(key, value); });
    vi.mocked(storage.removeItem).mockImplementation(async (key) => { disk.delete(key); });
  });

  it('waits for a departing editor write before loading after remount', async () => {
    let finish!: () => void;
    vi.mocked(storage.setItem).mockImplementationOnce(async (key, value) => {
      await new Promise<void>((resolve) => { finish = resolve; });
      disk.set(key, value);
    });
    const saving = saveDraft('diary', { body: 'unfinished' }, { baseVersion: 3 });
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    const loading = loadDraftRecord('diary');
    finish();
    await saving;
    expect(await loading).toMatchObject({ value: { body: 'unfinished' }, baseVersion: 3 });
  });

  it('does not resurrect a successfully cleared draft after a delayed write', async () => {
    let finish!: () => void;
    vi.mocked(storage.setItem).mockImplementationOnce(async (key, value) => {
      await new Promise<void>((resolve) => { finish = resolve; });
      disk.set(key, value);
    });
    const saving = saveDraft('diary', { body: 'submitted' });
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    const clearing = clearDraft('diary');
    finish();
    await saving;
    await clearing;
    expect(await loadDraftRecord('diary')).toBeNull();
  });

  it('allows retry after a rejected write', async () => {
    vi.mocked(storage.setItem).mockRejectedValueOnce(new Error('disk full'));
    await expect(saveDraft('diary', { body: 'draft' })).rejects.toThrow('disk full');
    await saveDraft('diary', { body: 'retry' });
    expect(await loadDraftRecord('diary')).toMatchObject({ value: { body: 'retry' } });
  });
});

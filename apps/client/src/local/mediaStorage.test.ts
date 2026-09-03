import { describe, expect, it } from 'vitest';
import { saveDurableLocalMedia } from './mediaStorage';

describe('durable local media storage', () => {
  it('does not claim a durable H5 save when IndexedDB and OPFS are unavailable', async () => {
    await expect(
      saveDurableLocalMedia(new Blob(['fixture']), 'image/png'),
    ).rejects.toThrow('可靠的本地媒体保存');
  });

  it('rejects a browser path that is not a persisted media URI', async () => {
    await expect(
      saveDurableLocalMedia('/tmp/browser-temp.png', 'image/png'),
    ).rejects.toThrow('临时路径');
  });
});

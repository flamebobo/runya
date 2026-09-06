import Taro from '@tarojs/taro';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRequest } from './client';

describe('apiRequest body handling', () => {
  const requestMock = vi.fn();

  beforeEach(() => {
    requestMock.mockReset();
    requestMock.mockResolvedValue({
      statusCode: 200,
      data: { data: { ok: true } },
    });
    (Taro as unknown as { request: typeof Taro.request }).request = requestMock;
  });

  it('leaves Content-Type off body-less mutations', async () => {
    await apiRequest('/memories/capsules/CAPSULE_ID/seal', { method: 'POST' });

    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        header: expect.not.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    );
  });

  it('keeps JSON Content-Type when a mutation has a body', async () => {
    await apiRequest('/memories/capsules/CAPSULE_ID/favorite', {
      method: 'PATCH',
      body: { favorite: true },
    });

    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'PATCH',
        header: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    );
  });

  it('forwards a stable idempotency key for retryable creates', async () => {
    await apiRequest('/families/FAMILY_ID/tasks', {
      method: 'POST',
      body: { id: 'TASK_ID', title: '一起收拾玩具' },
      idempotencyKey: 'OPERATION_ID',
    });

    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        data: { id: 'TASK_ID', title: '一起收拾玩具' },
        header: expect.objectContaining({ 'Idempotency-Key': 'OPERATION_ID' }),
      }),
    );
  });
});

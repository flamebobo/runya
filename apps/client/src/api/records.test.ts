import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiRequestMock } = vi.hoisted(() => ({
  apiRequestMock: vi.fn(),
}));

vi.mock('./client', () => ({
  apiRequest: apiRequestMock,
}));

import { fetchRecordStats } from './records';

describe('records api', () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
  });

  it('sends the local UTC offset used by statistics buckets', () => {
    fetchRecordStats('baby-1', {
      range: 'week',
      date: '2026-09-01',
      utcOffsetMinutes: 480,
    });

    expect(apiRequestMock).toHaveBeenCalledWith(
      '/babies/baby-1/records/stats?range=week&date=2026-09-01&utcOffsetMinutes=480',
    );
  });
});

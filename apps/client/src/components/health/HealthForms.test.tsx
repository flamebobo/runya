import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { HealthEventPublic } from '@runew/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAutoDraft } from '@/hooks/useAutoDraft';
import { useAuthRuntimeStore, useFamilyRuntimeStore } from '@/stores/runtime';
import { HealthEventForm } from './HealthForms';

vi.mock('@/hooks/useAutoDraft', () => ({ useAutoDraft: vi.fn() }));

const current: HealthEventPublic = {
  id: '01JHEALTHEVENT000000000000',
  familyId: '01JHEALTHFAMILY0000000000',
  babyId: '01JHEALTHBABY000000000000',
  eventType: 'CHECKUP',
  title: '儿保复查',
  scheduledAt: Date.UTC(2026, 8, 8, 2),
  completedAt: null,
  status: 'UPCOMING',
  locationName: null,
  locationAddress: null,
  doctorName: null,
  note: '服务端的最新备注',
  timezoneName: 'Asia/Shanghai',
  createdBy: '01JHEALTHUSER000000000000',
  createdAt: Date.UTC(2026, 8, 1, 2),
  updatedBy: '01JHEALTHUSER000000000000',
  updatedAt: Date.UTC(2026, 8, 2, 2),
  version: 2,
};

describe('HealthEventForm draft safety', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthRuntimeStore.getState().setUserId('01JHEALTHUSER000000000000');
    useFamilyRuntimeStore.getState().setFamilyId('01JHEALTHFAMILY0000000000');
  });

  it('blocks an outdated health-note draft until the user discards it', async () => {
    let conflict = true;
    const discard = vi.fn(async () => {
      conflict = false;
    });
    vi.mocked(useAutoDraft).mockImplementation(
      () =>
        ({
          restored: null,
          pending: null,
          ready: true,
          error: null,
          baseVersion: 1,
          conflict: conflict
            ? { baseVersion: 1, serverVersion: 2, draftSavedAt: Date.UTC(2026, 8, 1) }
            : null,
          recover: () => null,
          dismissConflict: () => undefined,
          flush: async () => true,
          clear: async () => undefined,
          discard,
        }) as never,
    );
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(
      <HealthEventForm
        current={current}
        onSave={onSave}
        onDone={vi.fn()}
        onReturn={vi.fn()}
      />,
    );

    expect(screen.getByRole('alert').textContent).toContain('不能用旧草稿覆盖最新内容');
    expect((screen.getByRole('button', { name: '保存修改' }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: '丢弃草稿并查看最新版本' }));

    await waitFor(() => expect(discard).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect((screen.getByRole('button', { name: '保存修改' }) as HTMLButtonElement).disabled).toBe(false),
    );
    expect((screen.getByLabelText('备注') as HTMLTextAreaElement).value).toBe(
      '服务端的最新备注',
    );
    expect(onSave).not.toHaveBeenCalled();
  });
});

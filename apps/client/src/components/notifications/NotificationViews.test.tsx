import type { NotificationPublic } from '@runew/contracts';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NotificationCenterView, notificationTargetUrl } from './NotificationViews';

const item: NotificationPublic = {
  id: '01JDEM3NOTIFICATION000000000',
  category: 'HEALTH',
  title: '儿保提醒',
  body: '下次儿保的时间快到了',
  targetType: 'HEALTH_EVENT',
  targetId: '01JDEM3HEALTH00000000000000',
  createdAt: Date.UTC(2026, 8, 3, 2),
  readAt: null,
};

describe('NotificationCenterView', () => {
  it('builds a real health deep link', () => {
    expect(notificationTargetUrl(item)).toBe(
      '/pages/health/index?view=detail&id=01JDEM3HEALTH00000000000000',
    );
  });

  it('marks an unread notification and opens its target', () => {
    const onRead = vi.fn();
    const onOpen = vi.fn();
    render(
      <NotificationCenterView
        items={[item]}
        unreadCount={1}
        onRead={onRead}
        onOpen={onOpen}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /儿保提醒，未读/ }));
    expect(onRead).toHaveBeenCalledWith(item.id);
    expect(onOpen).toHaveBeenCalledWith(item);
  });
});

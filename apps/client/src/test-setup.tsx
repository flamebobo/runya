import type { PropsWithChildren } from 'react';
import { vi } from 'vitest';

vi.mock('@tarojs/taro', () => ({
  default: {
    getEnv: () => 'WEB',
    ENV_TYPE: { WEAPP: 'WEAPP', WEB: 'WEB' },
    getStorage: vi.fn(),
    setStorage: vi.fn(),
    removeStorage: vi.fn(),
    getNetworkType: vi.fn(async () => ({ networkType: 'wifi' })),
    onNetworkStatusChange: vi.fn(),
    offNetworkStatusChange: vi.fn(),
    getSystemInfoSync: vi.fn(() => ({
      screenHeight: 844,
      screenWidth: 390,
      statusBarHeight: 44,
      safeArea: { top: 44, bottom: 810, left: 0, right: 390 },
    })),
    navigateTo: vi.fn(),
    navigateBack: vi.fn(),
    reLaunch: vi.fn(),
    onAppShow: vi.fn(),
    offAppShow: vi.fn(),
    // 页面生命周期钩子：jsdom 无真实页面，注册即忽略（useAutoDraft 等使用）。
    useDidHide: () => undefined,
    useRouter: () => ({ params: {} }),
  },
  useLaunch: (callback: () => void) => callback(),
  useRouter: () => ({ params: {} }),
}));

vi.mock('@tarojs/components', () => ({
  View: ({ children, ...props }: PropsWithChildren<Record<string, unknown>>) => (
    <div {...props}>{children}</div>
  ),
  Text: ({ children, ...props }: PropsWithChildren<Record<string, unknown>>) => (
    <span {...props}>{children}</span>
  ),
  Input: ({ onInput, ...props }: Record<string, unknown>) => (
    <input
      {...props}
      onChange={(event) =>
        (onInput as ((e: { detail: { value: string } }) => void) | undefined)?.({
          detail: { value: (event.target as HTMLInputElement).value },
        })
      }
    />
  ),
  Textarea: (props: Record<string, unknown>) => <textarea {...props} />,
  Canvas: (props: Record<string, unknown>) => <canvas {...props} />,
  Button: ({ children, ...props }: PropsWithChildren<Record<string, unknown>>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  Image: ({ src, ...props }: Record<string, unknown>) => (
    <img src={typeof src === 'string' ? src : ''} alt="" {...props} />
  ),
  Picker: ({ children, ...props }: PropsWithChildren<Record<string, unknown>>) => (
    <div {...props}>{children}</div>
  ),
}));

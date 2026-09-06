import Taro from '@tarojs/taro';
import { familyInviteLink } from '@/utils/familyInvite';

export function getFamilyInviteLink(token: string): string | null {
  if (typeof window === 'undefined') return null;
  return familyInviteLink(token, window.location.origin);
}

export async function copyFamilyInvite(value: string) {
  await Taro.setClipboardData({ data: value });
}

export async function shareFamilyInvite(
  url: string,
): Promise<'shared' | 'cancelled' | 'unsupported'> {
  if (typeof navigator === 'undefined' || !navigator.share) return 'unsupported';
  try {
    await navigator.share({ title: '一起来到我们的小家', url });
    return 'shared';
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') return 'cancelled';
    throw error;
  }
}

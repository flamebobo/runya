import qrcode from 'qrcode-generator';

export const FAMILY_JOIN_PATH = '/pages/family/join/index';

export function familyInviteLink(token: string, origin: string) {
  return `${origin}/#${FAMILY_JOIN_PATH}?token=${encodeURIComponent(token)}`;
}

export function parseFamilyInvite(value: string): string | null {
  const trimmed = value.trim();
  if (/^[A-Za-z0-9_-]{32}$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    if (!['https:', 'http:'].includes(url.protocol)) return null;
    const query = url.hash.includes('?')
      ? url.hash.slice(url.hash.indexOf('?') + 1)
      : url.search;
    const token = new URLSearchParams(query).get('token');
    return token && /^[A-Za-z0-9_-]{32}$/.test(token) ? token : null;
  } catch {
    return null;
  }
}

export function createInviteQr(value: string) {
  const code = qrcode(0, 'M');
  code.addData(value);
  code.make();
  return code;
}

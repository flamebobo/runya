import { describe, expect, it } from 'vitest';
import jsQR from 'jsqr';
import { createInviteQr, familyInviteLink, parseFamilyInvite } from './familyInvite';

describe('family invitation', () => {
  const token = 'Abcdefghijklmnopqrstuvwx12345678';
  it('keeps the complete token in the join link', () => {
    const link = familyInviteLink(token, 'https://runew.example');
    expect(parseFamilyInvite(link)).toBe(token);
    expect(parseFamilyInvite(token)).toBe(token);
    expect(parseFamilyInvite(token.slice(0, 12))).toBeNull();
    expect(parseFamilyInvite('javascript:alert(1)')).toBeNull();
  });
  it('generates a QR that an independent decoder reads as the exact link', () => {
    const link = familyInviteLink(token, 'https://runew.example');
    const code = createInviteQr(link);
    const modules = code.getModuleCount();
    const scale = 6;
    const border = 4;
    const size = (modules + border * 2) * scale;
    const pixels = new Uint8ClampedArray(size * size * 4).fill(255);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const row = Math.floor(y / scale) - border;
        const col = Math.floor(x / scale) - border;
        if (row >= 0 && col >= 0 && row < modules && col < modules && code.isDark(row, col)) {
          const index = (y * size + x) * 4;
          pixels[index] = pixels[index + 1] = pixels[index + 2] = 0;
        }
      }
    }
    expect(jsQR(pixels, size, size)?.data).toBe(link);
  });
});

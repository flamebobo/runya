import { createElement, type ReactNode } from 'react';
import { View } from '@tarojs/components';
import classNames from '@/utils/classNames';
import styles from './Glyph.module.scss';

export type GlyphName =
  | 'menu'
  | 'plus'
  | 'house'
  | 'list'
  | 'heart'
  | 'search'
  | 'close'
  | 'chevron'
  | 'gem'
  | 'growth'
  | 'grid'
  | 'photo'
  | 'family'
  | 'book'
  | 'baby'
  | 'settings'
  | 'bottle'
  | 'moon'
  | 'quote'
  | 'smile'
  | 'diary'
  | 'dash'
  | 'minus'
  | 'bell'
  | 'mic'
  | 'bowl'
  | 'diaper'
  | 'sparkle';

export interface GlyphProps {
  name: GlyphName;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function Glyph({ name, size = 'md', className }: GlyphProps) {
  return (
    <View className={classNames(styles.root, styles[`size-${size}`], className)} aria-hidden>
      {createElement(
        'svg',
        {
          xmlns: 'http://www.w3.org/2000/svg',
          viewBox: '0 0 24 24',
          width: '100%',
          height: '100%',
          fill: 'none',
          focusable: 'false',
          'aria-hidden': 'true',
          style: { display: 'block', overflow: 'visible' },
        },
        renderPaths(name),
      )}
    </View>
  );
}

function p(d: string, extra: Record<string, string | number> = {}) {
  return createElement('path', {
    key: d.slice(0, 28),
    d,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    ...extra,
  });
}

function renderPaths(name: GlyphName): ReactNode {
  switch (name) {
    case 'menu':
      return [p('M5 8h14'), p('M5 12h14'), p('M5 16h10')];
    case 'plus':
      return [p('M12 6.2v11.6'), p('M6.2 12h11.6')];
    case 'house':
      return [
        p('M5 11.2 12 5.4l7 5.8'),
        p('M7.2 10.6V18.2h9.6V10.6'),
        p('M10.4 18.2v-4.2h3.2v4.2'),
      ];
    case 'list':
      return [
        p('M9.4 7.4h9.2'),
        p('M9.4 12h9.2'),
        p('M9.4 16.6h9.2'),
        p('M5.6 7.4h.01', { strokeWidth: 2.4 }),
        p('M5.6 12h.01', { strokeWidth: 2.4 }),
        p('M5.6 16.6h.01', { strokeWidth: 2.4 }),
      ];
    case 'heart':
      return [
        p(
          'M12 19.4c0 0-6.6-4.1-6.6-8.6A3.5 3.5 0 0 1 12 8.1a3.5 3.5 0 0 1 6.6 2.7c0 4.5-6.6 8.6-6.6 8.6z',
        ),
      ];
    case 'search':
      return [p('M11.4 16.2a4.8 4.8 0 1 0 0-9.6 4.8 4.8 0 0 0 0 9.6z'), p('M14.8 14.8 18.6 18.6')];
    case 'close':
      return [p('M7 7l10 10'), p('M17 7 7 17')];
    case 'chevron':
      return [p('M9.2 6.6 15 12l-5.8 5.4')];
    case 'gem':
      return [p('M12 4.8 18.6 10.2 12 19.4 5.4 10.2z'), p('M5.4 10.2h13.2'), p('M9.1 10.2 12 4.8l2.9 5.4')];
    case 'growth':
      return [
        p('M12 19.2V10.4'),
        p('M12 10.6c0 0-3.4 1.4-4.1-1.8 2.6.1 3.8 1.4 4.1 1.8z'),
        p('M12 10.6c0 0 3.4 1.4 4.1-1.8-2.6.1-3.8 1.4-4.1 1.8z'),
        p('M8.8 19.2h6.4'),
      ];
    case 'grid':
      return [
        p('M6.4 6.4h4.4v4.4H6.4z'),
        p('M13.2 6.4h4.4v4.4h-4.4z'),
        p('M6.4 13.2h4.4v4.4H6.4z'),
        p('M13.2 13.2h4.4v4.4h-4.4z'),
      ];
    case 'photo':
      return [
        p('M5.4 8.2h13.2a1.2 1.2 0 0 1 1.2 1.2v8a1.2 1.2 0 0 1-1.2 1.2H5.4a1.2 1.2 0 0 1-1.2-1.2v-8a1.2 1.2 0 0 1 1.2-1.2z'),
        p('M8.2 15.8 10.8 12.6l2.4 2.4 1.7-1.6 3.3 3.6'),
      ];
    case 'family':
      return [
        p('M8.4 18.4v-4.2a2.1 2.1 0 0 1 4.2 0v4.2'),
        p('M10.5 9.4a1.7 1.7 0 1 0 0-3.4 1.7 1.7 0 0 0 0 3.4z'),
        p('M13.6 18.4v-3.6a1.9 1.9 0 0 1 3.8 0v3.6'),
        p('M15.5 10.2a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z'),
      ];
    case 'book':
      return [
        p('M12 6.6v12.2'),
        p('M12 6.6C9.2 5.4 7 5.8 5.4 6.6v12c1.8-.8 4-1.1 6.6 0'),
        p('M12 6.6c2.8-1.2 5-.8 6.6 0v12c-1.8-.8-4-1.1-6.6 0'),
      ];
    case 'baby':
      return [
        p('M12 18.2a6 6 0 1 0 0-12 6 6 0 0 0 0 12z'),
        p('M8.4 8.2c-.6-1.5.2-2.7 1.7-2.5'),
        p('M15.6 8.2c.6-1.5-.2-2.7-1.7-2.5'),
        p('M10 12.2h.2', { strokeWidth: 2 }),
        p('M13.8 12.2h.2', { strokeWidth: 2 }),
        p('M10.3 14.6c.6.7 1.4 1 3.4 0'),
      ];
    case 'settings':
      return [
        p('M12 14.6a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2z'),
        p('M12 5.2v1.8M12 17v1.8M5.2 12h1.8M17 12h1.8'),
        p('M7.1 7.1l1.3 1.3M15.6 15.6l1.3 1.3M16.9 7.1l-1.3 1.3M8.4 15.6l-1.3 1.3'),
      ];
    case 'bottle':
      return [
        p('M10 4.8h4v2.2h-4z'),
        p('M9.2 7h5.6v11.2a2 2 0 0 1-2 2h-1.6a2 2 0 0 1-2-2V7z'),
        p('M9.4 12.4h5.2'),
      ];
    case 'moon':
      return [p('M15.4 6.6A6.6 6.6 0 1 0 17.8 15 5.1 5.1 0 0 1 15.4 6.6z')];
    case 'quote':
      return [
        p('M7.2 10.4h3.4v5.4H7.4A2.4 2.4 0 0 1 7.2 10.4z'),
        p('M13.4 10.4h3.4v5.4h-3.2A2.4 2.4 0 0 1 13.4 10.4z'),
      ];
    case 'smile':
      return [
        p('M12 19.2a7.2 7.2 0 1 0 0-14.4 7.2 7.2 0 0 0 0 14.4z'),
        p('M9.1 11.1h.2', { strokeWidth: 2.1 }),
        p('M14.7 11.1h.2', { strokeWidth: 2.1 }),
        p('M9.2 14.2a3.4 3.4 0 0 0 5.6 0'),
      ];
    case 'diary':
      return [
        p('M7.2 5.4h9.6a1.4 1.4 0 0 1 1.4 1.4v10.4a1.4 1.4 0 0 1-1.4 1.4H7.2z'),
        p('M9.6 9.4h5.4'),
        p('M9.6 12.6h5.4'),
      ];
    case 'dash':
      return [p('M12 19.2a7.2 7.2 0 1 0 0-14.4 7.2 7.2 0 0 0 0 14.4z', { strokeDasharray: '2.4 2.6' })];
    case 'minus':
      return [p('M6.2 12h11.6')];
    case 'bell':
      return [
        p('M8.2 17h7.6'),
        p('M9.4 17V11.2a2.6 2.6 0 1 1 5.2 0V17'),
        p('M10.8 17a1.2 1.2 0 0 0 2.4 0'),
        p('M12 6.8V5.8'),
      ];
    case 'mic':
      return [
        p('M12 14.2a2.4 2.4 0 0 0 2.4-2.4V8.2a2.4 2.4 0 0 0-4.8 0v3.6A2.4 2.4 0 0 0 12 14.2z'),
        p('M8.2 11.4v.4A3.8 3.8 0 0 0 12 15.6 3.8 3.8 0 0 0 15.8 11.8v-.4'),
        p('M12 15.6V18.4M9.6 18.4h4.8'),
      ];
    case 'bowl':
      return [
        p('M6.2 11.2h11.6s-.4 6.6-5.8 6.6-5.8-6.6-5.8-6.6z'),
        p('M9.2 8.4c.4-1.4 1.4-2 2.8-2'),
        p('M14.6 8.2c-.2-1.2.4-2 1.6-2.2'),
      ];
    case 'diaper':
      return [
        p('M6.4 8.4h11.2v3.2c0 4-2.4 6.4-5.6 6.4S6.4 15.6 6.4 11.6V8.4z'),
        p('M9.2 8.4c.4 2.4 1.4 3.6 2.8 3.6s2.4-1.2 2.8-3.6'),
      ];
    case 'sparkle':
      return [p('M12 5.2 13.2 10 18.2 12 13.2 14 12 18.8 10.8 14 5.8 12 10.8 10z')];
    default:
      return null;
  }
}

import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { defineConfig } from 'vitest/config';

function resolveTsFromJs(source: string, importer: string): string | null {
  if (!source.endsWith('.js') || !source.startsWith('.')) {
    return null;
  }

  const tsSource = source.replace(/\.js$/, '.ts');
  return path.resolve(path.dirname(importer), tsSource);
}

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'apps/client/src'),
      '@runew/db': path.resolve(__dirname, 'packages/db/src/index.ts'),
      '@runew/contracts': path.resolve(__dirname, 'packages/contracts/src/index.ts'),
      '@runew/domain-types': path.resolve(__dirname, 'packages/domain-types/src/index.ts'),
      '@runew/shared-utils': path.resolve(__dirname, 'packages/shared-utils/src/index.ts'),
      '@runew/validation': path.resolve(__dirname, 'packages/validation/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    environmentMatchGlobs: [['apps/client/**', 'jsdom']],
    setupFiles: ['./vitest.setup.ts', './apps/client/src/test-setup.tsx'],
    include: [
      'apps/server/src/**/*.test.ts',
      'packages/**/*.test.ts',
      'db/**/*.test.ts',
      'apps/client/src/**/*.test.ts',
      'apps/client/src/**/*.test.tsx',
    ],
  },
  plugins: [
    {
      name: 'resolve-ts-from-js-imports',
      enforce: 'pre',
      resolveId(source, importer) {
        if (!importer) return null;
        const tsPath = resolveTsFromJs(source, importer);
        if (!tsPath) return null;
        return pathToFileURL(tsPath).href;
      },
    },
    {
      name: 'stub-figma-assets',
      load(id) {
        if (/\.(svg|png)$/.test(id.split('?')[0] ?? '')) {
          return 'export default "asset-stub"';
        }
        return null;
      },
    },
  ],
});

import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const clientRequire = createRequire('/Users/laihuibo/Documents/projects/practice/runya/apps/client/package.json');

describe('H5 production minification', () => {
  it('keeps private fields valid with Taro Terser defaults', async () => {
    const configSource = readFileSync(
      '/Users/laihuibo/Documents/projects/practice/runya/apps/client/config/index.ts',
      'utf8',
    );
    expect(configSource).toContain('output: { quote_keys: false }');

    const runnerPackage = clientRequire.resolve('@tarojs/webpack5-runner/package.json');
    const runnerRequire = createRequire(runnerPackage);
    const { minify } = runnerRequire('terser') as {
      minify: (
        code: string,
        options: Record<string, unknown>,
      ) => Promise<{ code?: string }>;
    };
    const result = await minify(
      'class Counter { #count = 1; value() { return this.#count; } } globalThis.result = new Counter().value();',
      {
        keep_fnames: true,
        output: {
          comments: false,
          keep_quoted_props: true,
          quote_keys: false,
          beautify: false,
        },
      },
    );

    expect(result.code).toBeTruthy();
    const context: Record<string, unknown> = {};
    vm.runInNewContext(result.code!, context);
    expect(context.result).toBe(1);
  });
});

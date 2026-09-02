import path from 'node:path';
import { defineConfig, type UserConfigExport } from '@tarojs/cli';

export default defineConfig(async (merge) => {
  const base: UserConfigExport = {
    projectName: 'runew',
    date: '2026-3-24',
    designWidth: 390,
    alias: {
      '@': path.resolve(__dirname, '..', 'src'),
    },
    deviceRatio: {
      375: 750 / 375,
      390: 750 / 390,
      430: 750 / 430,
    },
    sourceRoot: 'src',
    outputRoot: 'dist',
    plugins: ['@tarojs/plugin-framework-react'],
    defineConstants: {},
    copy: {
      patterns: [],
      options: {},
    },
    framework: 'react',
    compiler: {
      type: 'webpack5',
      prebundle: {
        enable: false,
      },
    },
    cache: {
      enable: false,
    },
    mini: {
      postcss: {
        pxtransform: {
          enable: true,
          config: {},
        },
      },
    },
    h5: {
      publicPath: '/',
      staticDirectory: 'static',
      postcss: {
        autoprefixer: {
          enable: true,
        },
        cssModules: {
          enable: true,
          config: {
            namingPattern: 'module',
            generateScopedName: '[name]__[local]___[hash:base64:5]',
          },
        },
      },
      devServer: {
        port: Number(process.env.CLIENT_PORT) || 8086,
        client: {
          overlay: {
            errors: true,
            warnings: false,
          },
        },
      },
    },
  };

  return merge({}, base);
});

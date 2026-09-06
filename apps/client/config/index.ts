import path from 'node:path';
import { defineConfig, type UserConfigExport } from '@tarojs/cli';

/** webpack-dev-server 4 默认也占用 `/ws`。产品实时通道（Tech Design §57.1）必须独占这条路径。 */
const WEBPACK_HMR_PATH = '/__webpack_hmr';

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
    // Taro's default quote_keys turns private fields into invalid quoted names.
    // Keep this at project scope so the typed Taro config applies it to H5 builds.
    terser: {
      config: {
        output: { quote_keys: false },
      },
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
        webSocketServer: {
          type: 'ws',
          options: { path: WEBPACK_HMR_PATH },
        },
        proxy: {
          '/api': {
            target: process.env.SERVER_URL ?? 'http://localhost:3000',
            changeOrigin: true,
          },
          '/ws': {
            target: process.env.SERVER_URL ?? 'http://localhost:3000',
            changeOrigin: true,
            ws: true,
          },
        },
        client: {
          webSocketURL: { pathname: WEBPACK_HMR_PATH },
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

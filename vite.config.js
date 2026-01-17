import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.js'),
      name: 'MonkeysJS',
      formats: ['es', 'umd', 'iife'],
      fileName: (format) => {
        if (format === 'es') return 'monkeysjs.esm.js';
        if (format === 'umd') return 'monkeysjs.umd.js';
        if (format === 'iife') return 'monkeysjs.min.js';
        return `monkeysjs.${format}.js`;
      }
    },
    rollupOptions: {
      output: {
        exports: 'named',
        globals: {}
      }
    },
    minify: 'esbuild',
    sourcemap: true
  },
  define: {
    __VERSION__: JSON.stringify(process.env.npm_package_version || '1.0.0')
  },
  test: {
    globals: true,
    environment: 'jsdom'
  }
});

/**
 * 鸿蒙移植版（H1）的 Vite 配置。
 *
 * 与桌面版的三点差异，都是 ArkWeb 加载 $rawfile 决定的：
 * 1. `base: './'`：产物必须是相对路径。绝对路径 `/assets/*` 在
 *    `resource://rawfile/index.html` 下会被解析到 scheme 根，首屏白屏。
 * 2. `outDir` 直接落进 `entry/src/main/resources/rawfile`，由 HAP 打包带走。
 * 3. `target: 'es2020'`：ArkWeb 内核版本随系统，按 ES2020 收敛，避免新语法。
 *
 * 构建后还有一步 `scripts/postbuild-rawfile.mjs`：剥掉 `crossorigin` 属性
 * （`resource:` 不是 CORS 协议，带该属性会让 module script 被拒）并做 A1/A2 断言。
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: '../entry/src/main/resources/rawfile',
    emptyOutDir: true,
    sourcemap: false,
    target: 'es2020',
    assetsInlineLimit: 4096,
    chunkSizeWarningLimit: 2048,
  },
});

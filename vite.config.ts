import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  plugins: [vue()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    host: true,
    port: 5173,
    strictPort: false,
    watch: {
      // 3. tell vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
    fs: {
      // 阻止 Vite 扫描 Rust target 目录（含数万文档 HTML，导致 EMFILE）
      deny: ["src-tauri/target"],
    },
  },

  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },

  // 4. build configuration
  build: {
    // Tauri supports es2021, use esnext for top-level await support
    target: 'esnext',
    // don't minify for debug builds
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    // produce sourcemaps for debug builds
    sourcemap: !!process.env.TAURI_DEBUG,
    // Tauri 使用 asset:// 协议，需要相对路径
    assetsDir: 'assets',
  },

  // Tauri 使用 asset:// 协议加载前端，必须使用相对路径
  base: './',

  // 5. optimize dependencies to handle ESM modules with top-level await
  optimizeDeps: {
    esbuildOptions: {
      target: 'esnext',
    },
  },
}))

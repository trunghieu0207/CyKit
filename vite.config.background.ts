import { resolve } from 'node:path'
import { defineConfig } from 'vite'

/**
 * Service worker build. Unlike the content script this one *is* an ES module
 * (`"type": "module"` in the manifest), but it still has to land at exactly
 * dist/background.js, and emptyOutDir stays false because build:pages owns
 * dist/.
 */
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    sourcemap: false,
    lib: {
      entry: resolve(import.meta.dirname, 'src/background.ts'),
      formats: ['es'],
      fileName: () => 'background.js',
    },
  },
})

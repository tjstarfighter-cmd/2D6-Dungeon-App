import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// The companion app lives in `app/` but consumes data extracted into the
// repo-root `data/processed/` directory. We expose that as a `@game-data`
// alias and explicitly allow Vite to read from the parent dir.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@game-data': fileURLToPath(new URL('../data/processed', import.meta.url)),
    },
  },
  server: {
    fs: { allow: ['..'] },
  },
})

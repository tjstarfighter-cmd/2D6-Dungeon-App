import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// The companion app lives in `app/` but consumes data extracted into the
// repo-root `data/processed/` directory. We expose that as a `@game-data`
// alias and explicitly allow Vite to read from the parent dir.
//
// Deployed to GitHub Pages at https://tjstarfighter-cmd.github.io/2D6-Dungeon-App/.
// Production builds (and `vite preview`) use that subpath; `vite dev` stays at
// root so local development URLs don't change.
export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? '/2D6-Dungeon-App/' : '/',
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
}))

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// Vite config — https://vitejs.dev/config/
//
// Figma cleanup (21 Nov 2026): the Figma Make scaffold plugins are gone —
// figmaSiteConfiguration (which forced the "Figma Make App" title, a generic
// description and a robots noindex), the error-overlay replay, the refresh
// boundary fallback and the /.figma/make/kit.html dev route. Meta now lives
// in index.html as the single source of truth, and robots.txt is a static
// file under public/ (indexable). The .figma/ directory was deleted with
// the scaffold.
export default defineConfig(({ mode }) => {
  const emitSourcemaps = mode === 'development'

  return {
    base: '/',
    build: {
      sourcemap: emitSourcemaps ? 'inline' : false,
      minify: !emitSourcemaps,
      // Bundle budget (21 Nov 2026 baseline: main chunk 1,441.89 kB /
      // 413.37 kB gzip before lazy loading). Warn if any chunk passes 600 kB.
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          // Heavy vendor libs ride in their own chunks so the first paint
          // never waits on the map, PDF or auth SDKs. Pages import them via
          // React.lazy (see App.tsx), so these chunks load on demand.
          manualChunks(id) {
            if (id.includes('node_modules/leaflet') || id.includes('node_modules/react-leaflet')) return 'vendor-leaflet'
            if (id.includes('node_modules/jspdf')) return 'vendor-pdf'
            if (id.includes('node_modules/firebase') || id.includes('node_modules/@firebase')) return 'vendor-firebase'
            return undefined
          },
        },
      },
    },
    plugins: [
      react(),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, './src'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: parseInt(process.env.PORT || '8443'),
      strictPort: true,
      watch: {
        ignored: [
          // The frontend and FastAPI server share this workspace, but the
          // backend database/log/journal files are runtime state. Watching
          // them makes Vite full-reload the browser during every collection
          // write, which resets auth and leaves pages flashing indefinitely.
          '**/backend/**',
          '**/*.db',
          '**/*.db-*',
        ],
      },
    },
    preview: {
      host: '0.0.0.0',
      port: parseInt(process.env.PORT || '8443'),
    },
  }
})

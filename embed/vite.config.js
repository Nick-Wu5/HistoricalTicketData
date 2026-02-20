import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/', // Script will be loaded from site root (e.g. /ticket-embed.js)
  build: {
    lib: {
      entry: './src/main.jsx',
      name: 'TicketWidget',
      formats: ['iife'],
      fileName: () => 'ticket-embed.js'
    },
    outDir: 'dist',
    rollupOptions: {
      external: [],
      output: {
        inlineDynamicImports: true, // Single file; no code-splitting
        name: 'TicketWidget'
      }
    },
    minify: 'esbuild', // Default; no terser dependency. Set to 'terser' + install terser if you need drop_console later.
    sourcemap: false
  }
})

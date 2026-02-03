import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: './src/main.jsx',
      name: 'TicketWidget',
      formats: ['iife'],
      fileName: () => 'ticket-embed.js'
    },
    rollupOptions: {
      // Don't externalize anything - bundle everything together
      external: [],
      output: {
        // Inline all dependencies into a single file
        inlineDynamicImports: true,
        // Global variable name for the widget
        name: 'TicketWidget'
      }
    },
    // Optimize for production
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true
      }
    }
  }
})

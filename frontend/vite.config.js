import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Serve index.html for all routes so pathname-based routing works on refresh
    historyApiFallback: true,
  },
  build: {
    target: 'es2020',
    sourcemap: false,
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('/node_modules/react-datepicker/')) return 'datepicker-vendor'
          if (id.includes('/node_modules/recharts/')) return 'charts-vendor'
          if (id.includes('/node_modules/socket.io-client/')) return 'realtime-vendor'
        },
      },
    },
  },
})

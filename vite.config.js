import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/amfi-api': {
        target: 'https://www.amfiindia.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/amfi-api/, '/gateway/pollingsebi/api/amfi'),
        headers: {
          'Referer': 'https://www.amfiindia.com/polling/amfi/fund-performance',
        },
      },
    },
  },
})

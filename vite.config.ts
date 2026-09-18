import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const helpdeskTestPort = process.env.HELPDESK_TEST_PORT?.trim()
const e2eApiTarget = helpdeskTestPort
  ? `http://127.0.0.1:${helpdeskTestPort}`
  : 'http://127.0.0.1:5001/bacar-web/southamerica-east1/api'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@intranet/helpdesk-scheduling': resolve(
        __dirname,
        'backend/src/modules/helpdesk/schedulingConstants.ts',
      ),
    },
  },
  server: {
    proxy: {
      '/api/me': {
        target: helpdeskTestPort
          ? `http://127.0.0.1:${helpdeskTestPort}`
          : 'http://127.0.0.1:5001/bacar-web/southamerica-east1/widgetsApi',
        changeOrigin: true,
      },
      '/api': {
        target: e2eApiTarget,
        changeOrigin: true,
      },
    },
  },
})

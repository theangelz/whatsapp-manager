import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3333,
    host: true,
    allowedHosts: ['evo.sjnetwork.com.br'],
    hmr: {
      host: 'evo.sjnetwork.com.br',
      protocol: 'wss',
      clientPort: 443,
    },
  },
})

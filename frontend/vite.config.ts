import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Nada se incrusta como data: (las fuentes y los íconos pequeños) porque la CSP solo admite recursos del propio servidor
  build: { assetsInlineLimit: 0 },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': process.env.API_DESTINO ?? 'http://localhost:3000',
    },
  },
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const mccUrl = process.env.MCC_URL || 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: mccUrl, changeOrigin: true }
    }
  }
});

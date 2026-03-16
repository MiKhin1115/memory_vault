import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    proxy: {
      '/service' : {
        target: "https://uat-miniapp.kbzpay.com",
        changeOrigin: true,
        secure: true
      },
      '/baas' : {
        target: "https://uat-miniapp.kbzpay.com",
        changeOrigin: true,
        secure: true
      }
    }
  }
});

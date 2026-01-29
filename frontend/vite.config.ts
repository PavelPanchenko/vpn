import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // ngrok блокируется по Host header — добавляем разрешённый домен
    allowedHosts: ['5ffcf37ec1b4.ngrok-free.app'],
  },
});


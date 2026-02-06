import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // ngrok блокируется по Host header — добавляем разрешённый домен
    // Разрешаем любой subdomain ngrok-free.app (удобно для dev, без постоянных правок конфига)
    allowedHosts: ['.ngrok-free.app'],
  },
});


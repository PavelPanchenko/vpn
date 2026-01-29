import axios from 'axios';
import { authStore } from './authStore';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
});

api.interceptors.request.use((config) => {
  // Mini App эндпоинты не используют админский JWT — не подмешиваем Authorization
  const url = config.url ?? '';
  if (url.startsWith('/mini/')) return config;

  const token = authStore.getToken();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    if (status === 401) {
      const reqUrl: string = error?.config?.url ?? '';
      const isMiniRequest = reqUrl.startsWith('/mini/');
      const isMiniScreen = typeof window !== 'undefined' && window.location.pathname.startsWith('/mini');

      // В Mini App 401 — это нормальная бизнес-ошибка (initData/нет пользователя/нет активной локации),
      // не надо из-за этого разлогинивать админа и редиректить на /login.
      if (!isMiniRequest && !isMiniScreen) {
        // Токен есть, но он истёк/невалидный — чистим и отправляем на /login
        authStore.clear();
        if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
          window.location.assign('/login');
        }
      }
    }
    return Promise.reject(error);
  },
);


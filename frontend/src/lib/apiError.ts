import axios from 'axios';

type ApiErrorShape = {
  message?: unknown;
  error?: unknown;
};

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as ApiErrorShape | undefined;
    const msg =
      (typeof data?.message === 'string' && data.message) ||
      (Array.isArray(data?.message) && data?.message.map(String).join('\n')) ||
      (typeof data?.error === 'string' && data.error) ||
      error.message;
    if (msg) return msg;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}


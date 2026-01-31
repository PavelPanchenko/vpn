export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  const maybeMsg = (error as { message?: unknown } | null)?.message;
  if (typeof maybeMsg === 'string' && maybeMsg.trim()) return maybeMsg;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}


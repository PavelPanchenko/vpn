/**
 * Кольцевой буфер логов в памяти для отображения в админке.
 * Используется кастомным логгером до инициализации DI.
 */
const MAX_LINES = 5000;

const lines: string[] = [];

function formatTs(): string {
  return new Date().toISOString();
}

export const LogBuffer = {
  append(level: string, message: string, context?: string): void {
    const ctx = context ? ` [${context}]` : '';
    const line = `${formatTs()} ${level}${ctx} ${message}`;
    lines.push(line);
    if (lines.length > MAX_LINES) lines.shift();
  },

  getLines(): string[] {
    return [...lines];
  },

  clear(): void {
    lines.length = 0;
  },
};

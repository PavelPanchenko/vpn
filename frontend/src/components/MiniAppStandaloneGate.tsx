import { useMemo, useState } from 'react';
import type { TelegramTheme } from '../hooks/useTelegramWebAppUi';

export function MiniAppStandaloneGate(props: {
  theme: TelegramTheme;
  title: string;
  initialInitData?: string;
  onSubmit: (initData: string) => void;
}) {
  const { theme, title, initialInitData, onSubmit } = props;
  const [value, setValue] = useState(initialInitData ?? '');

  const canSubmit = useMemo(() => value.trim().length > 0, [value]);

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{
        background: theme.bg,
        color: theme.text,
        paddingTop: 'max(48px, calc(env(safe-area-inset-top, 0px) + 28px))',
      }}
    >
      <div className="w-full max-w-md">
        <div
          className="rounded-2xl border p-5"
          style={{
            borderColor: 'rgba(255,255,255,0.12)',
            background: theme.secondaryBg,
            boxShadow: '0 0 0 1px rgba(255,255,255,0.06), 0 6px 18px rgba(0,0,0,0.22)',
          }}
        >
          <div className="text-lg font-semibold">{title}</div>
          <div className="text-sm mt-1" style={{ color: theme.hint }}>
            Вы открыли Mini App в обычном браузере. Telegram WebApp API здесь недоступен, поэтому автоматическая авторизация не сработает.
          </div>

          <div className="mt-4 rounded-xl border px-3 py-3 text-sm" style={{ borderColor: 'rgba(255,255,255,0.10)' }}>
            <div className="text-xs mb-2" style={{ color: theme.hint }}>
              InitData (для standalone режима)
            </div>
            <textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              rows={4}
              className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none"
              style={{
                borderColor: 'rgba(255,255,255,0.14)',
                color: theme.text,
              }}
              placeholder="Вставьте initData (tgWebAppData) сюда"
            />
            <div className="mt-2 text-xs" style={{ color: theme.hint }}>
              Для обычных пользователей правильный путь — открыть мини‑приложение из Telegram‑бота. Этот экран нужен, чтобы можно было использовать UI как обычное web‑приложение (например, для тестов).
            </div>
          </div>

          <div className="mt-5 flex gap-3">
            <button
              onClick={() => onSubmit(value)}
              disabled={!canSubmit}
              className="flex-1 inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-medium disabled:opacity-50"
              style={{ background: theme.button, color: theme.buttonText }}
            >
              Продолжить
            </button>
            <button
              onClick={() => setValue('')}
              className="inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-medium border"
              style={{ borderColor: 'rgba(255,255,255,0.14)', color: theme.text }}
            >
              Очистить
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


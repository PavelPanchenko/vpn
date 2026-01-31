import type { TelegramTheme } from '../hooks/useTelegramWebAppUi';

export function MiniAppFatalError(props: { theme: TelegramTheme; title: string; message: string }) {
  const { theme, title, message } = props;
  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{
        background: theme.bg,
        color: theme.text,
        paddingTop: 'max(48px, calc(env(safe-area-inset-top, 0px) + 28px))',
      }}
    >
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold mb-4">{title}</h1>
        <p className="mb-4 whitespace-pre-wrap" style={{ color: theme.destructive }}>
          {message}
        </p>
        <p className="text-sm" style={{ color: theme.hint }}>
          Убедитесь, что открываете мини‑приложение через кнопку в Telegram‑боте.
        </p>
      </div>
    </div>
  );
}


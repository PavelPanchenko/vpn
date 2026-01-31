import type { TelegramTheme } from '../hooks/useTelegramWebAppUi';

export function MiniAppLoading(props: { theme: TelegramTheme }) {
  const { theme } = props;
  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{
        background: theme.bg,
        color: theme.text,
        paddingTop: 'max(48px, calc(env(safe-area-inset-top, 0px) + 28px))',
      }}
    >
      <div className="text-lg">Загрузка...</div>
    </div>
  );
}


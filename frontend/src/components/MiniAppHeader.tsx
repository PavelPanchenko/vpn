import type { TelegramTheme } from '../hooks/useTelegramWebAppUi';

export function MiniAppHeader(props: { theme: TelegramTheme; title: string }) {
  const { theme, title } = props;
  return (
    <header
      className="shrink-0 pt-12 pb-5 border-b max-w-md mx-auto w-full px-4"
      style={{ borderColor: 'rgba(255,255,255,0.08)' }}
    >
      <div className="flex items-center gap-3">
        <img src="/logo.png" alt="" className="w-12 h-12 shrink-0 rounded-xl object-contain" />
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="text-sm mt-0.5" style={{ color: theme.hint }}>
            Ваш доступ к VPN и подписке прямо в Telegram.
          </p>
        </div>
      </div>
    </header>
  );
}


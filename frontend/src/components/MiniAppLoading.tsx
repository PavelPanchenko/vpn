import type { TelegramTheme } from '../hooks/useTelegramWebAppUi';
import type { MiniLang } from '../lib/miniLang';
import type { mm } from '../lib/miniMessages';

export function MiniAppLoading(props: { theme: TelegramTheme; lang: MiniLang; m: ReturnType<typeof mm> }) {
  const { theme, m } = props;
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
          <div className="flex items-center gap-4">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center"
              style={{
                background: theme.button + '22',
                border: '1px solid ' + theme.button + '55',
              }}
            >
              <div
                className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin"
                style={{ borderColor: theme.button }}
              />
            </div>
            <div className="min-w-0">
              <div className="text-base font-semibold">{m.loading.title}</div>
              <div className="text-sm mt-1" style={{ color: theme.hint }}>
                {m.loading.subtitle}
              </div>
            </div>
          </div>

          <div className="mt-4 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.10)' }}>
            <div
              className="h-full rounded-full"
              style={{
                width: '45%',
                background: `linear-gradient(90deg, ${theme.button}55 0%, ${theme.button} 50%, ${theme.button}55 100%)`,
                animation: 'miniapp-loading 1.2s ease-in-out infinite',
              }}
            />
          </div>
        </div>
      </div>
      <style>{`
        @keyframes miniapp-loading {
          0% { transform: translateX(-30%); opacity: 0.6; }
          50% { transform: translateX(60%); opacity: 1; }
          100% { transform: translateX(130%); opacity: 0.6; }
        }
      `}</style>
    </div>
  );
}


import type { TelegramTheme } from '../hooks/useTelegramWebAppUi';
import type { MiniLang } from '../lib/miniLang';
import type { mm } from '../lib/miniMessages';

export function MiniAppFatalError(props: {
  theme: TelegramTheme;
  lang: MiniLang;
  m: ReturnType<typeof mm>;
  title: string;
  message: string;
  onRetry: () => void;
  onClose?: () => void;
}) {
  const { theme, m, title, message, onRetry, onClose } = props;
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
          <div className="flex items-start gap-4">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center text-xl"
              style={{
                background: theme.destructive + '22',
                border: '1px solid ' + theme.destructive + '55',
                color: theme.destructive,
              }}
            >
              !
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-lg font-semibold">{title}</div>
              <div className="text-sm mt-1" style={{ color: theme.hint }}>
                {m.fatal.title}
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-xl border px-3 py-2 text-sm whitespace-pre-wrap" style={{ borderColor: 'rgba(255,255,255,0.10)' }}>
            <div className="text-xs mb-1" style={{ color: theme.hint }}>
              {m.fatal.details}
            </div>
            <div style={{ color: theme.destructive }}>{message}</div>
          </div>

          <div className="mt-4 text-sm" style={{ color: theme.hint }}>
            {m.fatal.hint}
          </div>

          <div className="mt-5 flex gap-3">
            <button
              onClick={onRetry}
              className="flex-1 inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-medium"
              style={{ background: theme.button, color: theme.buttonText }}
            >
              {m.fatal.retry}
            </button>
            {onClose ? (
              <button
                onClick={onClose}
                className="inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-medium border"
                style={{ borderColor: 'rgba(255,255,255,0.14)', color: theme.text }}
              >
                {m.fatal.close}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}


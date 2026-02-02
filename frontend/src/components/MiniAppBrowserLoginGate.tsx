import { useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { TelegramTheme } from '../hooks/useTelegramWebAppUi';

export function MiniAppBrowserLoginGate(props: {
  theme: TelegramTheme;
  title: string;
  expiresAt: string;
  status: 'PENDING' | 'EXPIRED';
  deepLink: string | null;
  onRestart: () => void;
  onSubmitInitData: (initData: string) => void;
}) {
  const { theme, title, deepLink, expiresAt, status, onRestart, onSubmitInitData } = props;
  const [manual, setManual] = useState('');

  const qrPayload = useMemo(() => deepLink ?? 'about:blank', [deepLink]);
  const expiresText = useMemo(() => {
    try {
      return new Date(expiresAt).toLocaleTimeString();
    } catch {
      return expiresAt;
    }
  }, [expiresAt]);

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
            Вход в браузере подтверждается через Telegram‑бота.
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4">
            <div className="rounded-xl border p-4" style={{ borderColor: 'rgba(255,255,255,0.10)' }}>
              <div className="text-xs mb-2" style={{ color: theme.hint }}>
                Вход через QR
              </div>
              <div className="flex justify-center">
                <div className="rounded-xl bg-white p-3">
                  <QRCodeSVG value={qrPayload} size={156} />
                </div>
              </div>
              <div className="mt-2 text-xs text-center" style={{ color: theme.hint }}>
                Отсканируйте QR — откроется Telegram‑бот. Нажмите «Start», и вход подтвердится автоматически.
              </div>
            </div>
          </div>

          <div className="mt-5 flex gap-3">
            <button
              onClick={onRestart}
              className="flex-1 inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-medium border"
              style={{ borderColor: 'rgba(255,255,255,0.14)', color: theme.text }}
            >
              Обновить QR
            </button>
          </div>

          {!deepLink ? (
            <div className="mt-4 text-sm" style={{ color: theme.destructive }}>
              Бот не настроен (не удалось получить username). Настройте активного бота в админке и обновите страницу.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}


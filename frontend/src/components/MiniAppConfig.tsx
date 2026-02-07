import type { TelegramTheme } from '../hooks/useTelegramWebAppUi';
import { QRCodeSVG } from 'qrcode.react';
import type { MiniLang } from '../lib/miniLang';
import type { mm } from '../lib/miniMessages';

export function MiniAppConfig(props: {
  theme: TelegramTheme;
  btnTapClass: string;
  lang: MiniLang;
  m: ReturnType<typeof mm>;
  configUrl: string | null;
  configCopied: boolean;
  onBack: () => void;
  onCopy: () => void;
}) {
  const { theme, btnTapClass, m, configUrl, configCopied, onBack, onCopy } = props;

  return (
    <section
      className="rounded-2xl border p-4 space-y-4"
      style={{ borderColor: 'rgba(255,255,255,0.12)', background: theme.secondaryBg }}
    >
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">{m.config.title}</div>
        <button onClick={onBack} className={`text-xs ${btnTapClass}`} style={{ color: theme.link }}>
          {m.common.back}
        </button>
      </div>

      {configUrl ? (
        <div className="space-y-3">
          <div className="flex justify-center">
            <div className="bg-white p-2 rounded-xl">
              <QRCodeSVG value={configUrl} size={200} />
            </div>
          </div>
          <div className="rounded-xl p-3 text-xs break-all" style={{ background: 'rgba(0,0,0,0.35)' }}>
            {configUrl}
          </div>
          <button
            onClick={onCopy}
            className={`w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all duration-200 ${btnTapClass} ${configCopied ? 'scale-[0.98] opacity-90' : ''}`}
            style={{ background: configCopied ? 'rgba(34,197,94,0.3)' : theme.button, color: theme.buttonText }}
          >
            {configCopied ? m.config.copied : m.config.copyBtn}
          </button>
        </div>
      ) : (
        <p className="text-sm" style={{ color: theme.hint }}>
          {m.config.notLoaded}
        </p>
      )}
    </section>
  );
}


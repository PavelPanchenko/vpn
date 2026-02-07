import type { TelegramTheme } from '../hooks/useTelegramWebAppUi';
import type { mm } from '../lib/miniMessages';

export type PaymentMethodOption = {
  id: 'TELEGRAM_STARS' | 'PLATEGA' | 'CRYPTOCLOUD';
  title: string;
  subtitle: string;
  badge?: string;
};

export function MiniAppPaymentMethodSheet(props: {
  theme: TelegramTheme;
  btnTapClass: string;
  open: boolean;
  title: string;
  m: ReturnType<typeof mm>;
  options: PaymentMethodOption[];
  onClose: () => void;
  onSelect: (id: PaymentMethodOption['id']) => void;
}) {
  const { theme, btnTapClass, open, title, m, options, onClose, onSelect } = props;
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-3xl border p-4 pb-5"
        style={{ background: theme.secondaryBg, borderColor: 'rgba(255,255,255,0.12)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold">{title}</div>
          <button className={`text-xs ${btnTapClass}`} style={{ color: theme.link }} onClick={onClose}>
            {m.common.close}
          </button>
        </div>

        <div className="space-y-2">
          {options.map((o) => (
            <button
              key={o.id}
              onClick={() => onSelect(o.id)}
              className={`w-full text-left rounded-2xl border px-4 py-3 ${btnTapClass}`}
              style={{ borderColor: 'rgba(255,255,255,0.10)', background: 'rgba(255,255,255,0.04)' }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-sm" style={{ color: theme.text }}>
                    {o.title}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: theme.hint }}>
                    {o.subtitle}
                  </div>
                </div>
                {o.badge ? (
                  <span
                    className="shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
                    style={{ background: theme.button + '33', color: theme.text, border: '1px solid ' + theme.button + '66' }}
                  >
                    {o.badge}
                  </span>
                ) : null}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}


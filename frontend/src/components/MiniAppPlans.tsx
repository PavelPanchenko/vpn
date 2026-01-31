import type { TelegramTheme } from '../hooks/useTelegramWebAppUi';
import type { MiniPlan } from '../lib/miniTypes';
import { formatPrice } from '../lib/formatters';

export function MiniAppPlans(props: {
  theme: TelegramTheme;
  btnTapClass: string;
  plans: MiniPlan[];
  payingPlanId: string | null;
  onRefresh: () => void;
  onBack: () => void;
  onPay: (planId: string) => void;
}) {
  const { theme, btnTapClass, plans, payingPlanId, onRefresh, onBack, onPay } = props;

  return (
    <section
      className="rounded-2xl border p-4 space-y-4"
      style={{ borderColor: 'rgba(255,255,255,0.12)', background: theme.secondaryBg }}
    >
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">Тарифы</div>
        <div className="flex items-center gap-3">
          <button onClick={onRefresh} className={`text-xs ${btnTapClass}`} style={{ color: theme.link }}>
            Обновить
          </button>
          <button onClick={onBack} className={`text-xs ${btnTapClass}`} style={{ color: theme.link }}>
            Назад
          </button>
        </div>
      </div>

      {plans.length === 0 ? (
        <p className="text-sm py-4" style={{ color: theme.hint }}>
          Нажмите «Обновить», чтобы загрузить доступные тарифы.
        </p>
      ) : (
        <div className="space-y-4">
          {plans.map((p) => {
            const isTop = p.isTop ?? false;
            return (
              <div
                key={p.id}
                className="rounded-2xl p-4 transition-all duration-200"
                style={{
                  background: isTop
                    ? `linear-gradient(135deg, rgba(99,102,241,0.15) 0%, rgba(255,255,255,0.06) 100%)`
                    : 'rgba(255,255,255,0.06)',
                  border: `1px solid ${isTop ? theme.button + '80' : 'rgba(255,255,255,0.1)'}`,
                  boxShadow: isTop ? `0 4px 16px rgba(0,0,0,0.2)` : 'none',
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-base" style={{ color: theme.text }}>
                        {p.name}
                      </span>
                      {isTop && (
                        <span
                          className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                          style={{ background: theme.button, color: theme.buttonText }}
                        >
                          ⭐ Топ тариф
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-sm" style={{ color: theme.hint }}>
                      {p.periodDays} {p.periodDays === 1 ? 'день' : p.periodDays < 5 ? 'дня' : 'дней'}
                    </div>
                    {p.description ? (
                      <p className="mt-2 text-xs leading-snug" style={{ color: theme.hint }}>
                        {p.description}
                      </p>
                    ) : null}
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-lg font-bold" style={{ color: theme.text }}>
                      {formatPrice(p.price, p.currency)}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onPay(p.id);
                      }}
                      disabled={payingPlanId === p.id}
                      className={`mt-2 inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed ${btnTapClass}`}
                      style={{ background: theme.button, color: theme.buttonText }}
                    >
                      {payingPlanId === p.id ? 'Оплата...' : 'Оплатить'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}


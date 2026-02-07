import type { TelegramTheme } from '../hooks/useTelegramWebAppUi';
import type { MiniPlanGroup } from '../lib/planGrouping';
import { formatPlanGroupPrice } from '../lib/planGrouping';
import type { MiniLang } from '../lib/miniLang';
import type { mm } from '../lib/miniMessages';

export function MiniAppPlans(props: {
  theme: TelegramTheme;
  btnTapClass: string;
  lang: MiniLang;
  m: ReturnType<typeof mm>;
  planGroups: MiniPlanGroup[];
  payingPlanKey: string | null;
  onRefresh: () => void;
  onBack: () => void;
  onSelectPlan: (groupKey: string) => void;
}) {
  const { theme, btnTapClass, lang, m, planGroups, payingPlanKey, onRefresh, onBack, onSelectPlan } = props;

  return (
    <section
      className="rounded-2xl border p-4 space-y-4"
      style={{ borderColor: 'rgba(255,255,255,0.12)', background: theme.secondaryBg }}
    >
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">{m.plans.title}</div>
        <div className="flex items-center gap-3">
          <button onClick={onRefresh} className={`text-xs ${btnTapClass}`} style={{ color: theme.link }}>
            {m.common.refresh}
          </button>
          <button onClick={onBack} className={`text-xs ${btnTapClass}`} style={{ color: theme.link }}>
            {m.common.back}
          </button>
        </div>
      </div>

      {planGroups.length === 0 ? (
        <p className="text-sm py-4" style={{ color: theme.hint }}>
          {m.plans.hintRefresh}
        </p>
      ) : (
        <div className="space-y-4">
          {planGroups.map((g) => {
            const isTop = g.isTop ?? false;
            const hasStars = g.variants.some((v) => v.currency === 'XTR');
            const hasExternal = g.variants.some((v) => v.currency !== 'XTR');
            return (
              <div
                key={g.key}
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
                        {g.name}
                      </span>
                      {isTop && (
                        <span
                          className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                          style={{ background: theme.button, color: theme.buttonText }}
                        >
                          {m.plans.topPlan}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-sm" style={{ color: theme.hint }}>
                      {m.plans.periodDays(g.periodDays)}
                    </div>
                    {g.description ? (
                      <p className="mt-2 text-xs leading-snug" style={{ color: theme.hint }}>
                        {g.description}
                      </p>
                    ) : null}
                    <div className="mt-2 text-xs" style={{ color: theme.hint }}>
                      {m.plans.paymentMethods}{' '}
                      {hasStars ? <span style={{ color: theme.text }}>Stars</span> : null}
                      {hasStars && hasExternal ? ' · ' : null}
                      {hasExternal ? <span style={{ color: theme.text }}>{m.plans.card}</span> : null}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-lg font-bold" style={{ color: theme.text }}>
                      {formatPlanGroupPrice(g)}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onSelectPlan(g.key);
                      }}
                      disabled={payingPlanKey === g.key}
                      className={`mt-2 inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed ${btnTapClass}`}
                      style={{ background: theme.button, color: theme.buttonText }}
                    >
                      {payingPlanKey === g.key ? m.common.paymentInProgress : m.plans.payBtn}
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


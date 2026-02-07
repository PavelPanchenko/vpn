import type { TelegramTheme } from '../hooks/useTelegramWebAppUi';
import type { MiniServer, MiniStatus } from '../lib/miniTypes';
import type { MiniLang } from '../lib/miniLang';
import type { mm } from '../lib/miniMessages';

export function MiniAppHome(props: {
  theme: TelegramTheme;
  btnTapClass: string;
  lang: MiniLang;
  m: ReturnType<typeof mm>;
  status: MiniStatus;
  servers: MiniServer[];
  refreshingServers: boolean;
  activatingServerId: string | null;
  hasActiveServer: boolean;
  activeServerId: string | null;
  onRefreshServers: () => void;
  onActivateServer: (serverId: string) => void;
  onOpenConfig: () => void;
  onOpenPlans: () => void;
}) {
  const {
    theme,
    btnTapClass,
    lang,
    m,
    status,
    servers,
    refreshingServers,
    activatingServerId,
    hasActiveServer,
    activeServerId,
    onRefreshServers,
    onActivateServer,
    onOpenConfig,
    onOpenPlans,
  } = props;

  return (
    <>
      <section
        className="rounded-2xl border p-4 space-y-3 transition-shadow"
        style={{
          borderColor: 'rgba(255,255,255,0.12)',
          background: theme.secondaryBg,
          boxShadow: '0 0 0 1px rgba(255,255,255,0.06), 0 4px 12px rgba(0,0,0,0.15)',
        }}
      >
        <div className="flex items-center justify-between">
          <span className="text-sm" style={{ color: theme.hint }}>
            {m.home.accountStatus}
          </span>
          <span
            className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium"
            style={{
              background:
                status.status === 'NEW'
                  ? 'rgba(148,163,184,0.2)'
                  : status.status === 'ACTIVE'
                    ? 'rgba(34,197,94,0.25)'
                    : status.status === 'BLOCKED'
                      ? 'rgba(239,68,68,0.2)'
                      : 'rgba(251,191,36,0.2)',
              color: theme.text,
            }}
          >
            {status.status === 'NEW' && m.home.statusNew}
            {status.status === 'ACTIVE' && '✅ ACTIVE'}
            {status.status === 'BLOCKED' && '🚫 BLOCKED'}
            {status.status === 'EXPIRED' && '⏰ EXPIRED'}
          </span>
        </div>

        {status.expiresAt ? (
          <>
            <div className="flex items-center justify-between text-sm">
              <span style={{ color: theme.hint }}>{m.home.validUntil}</span>
              <span>
                {new Date(status.expiresAt).toLocaleDateString(lang === 'en' ? 'en-GB' : lang === 'uk' ? 'uk-UA' : 'ru-RU')}{' '}
                {m.home.daysShort(status.daysLeft)}
              </span>
            </div>
            {status.progressLeftPct != null ? (
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.max(0, Math.min(100, status.progressLeftPct))}%`,
                    background: (status.daysLeft ?? 0) <= 7 ? 'rgba(251,191,36,0.8)' : theme.button,
                  }}
                />
              </div>
            ) : null}
          </>
        ) : null}

        {hasActiveServer ? (
          <div className="flex items-center justify-between text-sm gap-4">
            <div>
              <div style={{ color: theme.hint }} className="mb-1">
                {m.home.activeLocation}
              </div>
              <div className="font-medium">{status.servers[0].name}</div>
            </div>
          </div>
        ) : (
          <p className="text-sm" style={{ color: theme.hint }}>
            {m.home.noActiveLocationHint}
          </p>
        )}
      </section>

      <section
        className="rounded-2xl border p-4 space-y-4"
        style={{ borderColor: 'rgba(255,255,255,0.12)', background: theme.secondaryBg }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">{m.home.locationsTitle}</h2>
          <button
            onClick={onRefreshServers}
            disabled={refreshingServers}
            className={`text-xs disabled:opacity-60 disabled:cursor-not-allowed ${btnTapClass}`}
            style={{ color: theme.link }}
          >
            {refreshingServers ? m.common.loadingDots : m.common.refresh}
          </button>
        </div>

        {servers.length === 0 ? (
          <div className="text-sm" style={{ color: theme.hint }}>
            {m.home.locationsNotLoaded}
          </div>
        ) : (
          <div
            className="rounded-2xl overflow-hidden border"
            style={{ borderColor: 'rgba(255,255,255,0.10)', background: 'rgba(255,255,255,0.03)' }}
          >
            {servers.map((s) => {
              const isActive = activeServerId != null && s.id === activeServerId;
              const isBusy = activatingServerId === s.id;
              const isRecommended = s.isRecommended ?? false;
              const slotsText = s.freeSlots != null ? m.home.slotsText(s.freeSlots) : null;
              return (
                <button
                  key={s.id}
                  disabled={isBusy || isActive}
                  onClick={() => onActivateServer(s.id)}
                  className={`w-full text-left px-4 py-3.5 transition-colors duration-200 disabled:opacity-60 disabled:cursor-not-allowed ${btnTapClass}`}
                  style={{
                    background: isActive
                      ? `linear-gradient(135deg, ${theme.button}38 0%, rgba(255,255,255,0.05) 100%)`
                      : isBusy
                        ? 'rgba(255,255,255,0.05)'
                        : isRecommended
                          ? 'rgba(255,255,255,0.06)'
                          : 'transparent',
                    borderTop: '1px solid rgba(255,255,255,0.08)',
                    color: theme.text,
                  }}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="flex shrink-0 w-10 h-10 rounded-xl items-center justify-center text-lg"
                      style={{
                        background: isActive
                          ? theme.button + '55'
                          : isRecommended
                            ? theme.button + '22'
                            : 'rgba(255,255,255,0.08)',
                        border: '1px solid ' + (isActive ? theme.button + '99' : 'rgba(255,255,255,0.10)'),
                      }}
                    >
                      {isActive ? '✓' : isRecommended ? '★' : '📍'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm truncate">{s.name}</span>
                            {isActive ? (
                              <span
                                className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
                                style={{ background: theme.button, color: theme.buttonText }}
                              >
                                {m.home.activeBadge}
                              </span>
                            ) : isRecommended ? (
                              <span
                                className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
                                style={{
                                  background: theme.button + '33',
                                  color: theme.text,
                                  border: '1px solid ' + theme.button + '66',
                                }}
                              >
                                {m.home.recommendedBadge}
                              </span>
                            ) : null}
                          </div>
                          <div className="text-[11px] mt-0.5" style={{ color: theme.hint }}>
                            {isBusy ? m.home.connecting : isActive ? m.home.connectedBtn : m.home.tapToConnectBtn}
                          </div>
                        </div>

                        <div className="shrink-0 flex items-center gap-2">
                          {slotsText ? (
                            <span
                              className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
                              style={{
                                background: 'rgba(255,255,255,0.06)',
                                border: '1px solid rgba(255,255,255,0.10)',
                                color: theme.hint,
                              }}
                            >
                              {slotsText}
                            </span>
                          ) : null}
                          <span className="opacity-60 text-base leading-none" aria-hidden>
                            {isActive ? '✓' : '\u203A'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section
        className="rounded-2xl border p-4 space-y-4"
        style={{ borderColor: 'rgba(255,255,255,0.12)', background: theme.secondaryBg }}
      >
        <h2 className="text-sm font-semibold">{m.home.configTitle}</h2>
        <button
          onClick={onOpenConfig}
          disabled={!hasActiveServer}
          className={`w-full inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed ${btnTapClass}`}
          style={{ background: theme.button, color: theme.buttonText }}
        >
          {m.home.getConfigBtn}
        </button>
        {!hasActiveServer ? (
          <div className="text-xs" style={{ color: theme.hint }}>
            {m.home.selectLocationFirst}
          </div>
        ) : null}
      </section>

      <section
        className="rounded-2xl border p-4 space-y-4"
        style={{ borderColor: 'rgba(255,255,255,0.12)', background: theme.secondaryBg }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">{m.home.plansTitle}</h2>
          <button onClick={onOpenPlans} className={`text-xs ${btnTapClass}`} style={{ color: theme.link }}>
            {m.home.openBtn}
          </button>
        </div>
        <p className="text-sm" style={{ color: theme.hint }}>
          {m.home.plansHint}
        </p>
      </section>
    </>
  );
}


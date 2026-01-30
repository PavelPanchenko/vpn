import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { QRCodeSVG } from 'qrcode.react';

declare global {
  interface Window {
    Telegram?: any;
  }
}

function formatTraffic(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatPrice(price: number, currency: string): string {
  if (currency === 'RUB') return `${price} ₽`;
  return `${price} ${currency}`;
}

type MiniStatus = {
  status: string;
  expiresAt: string | null;
  daysLeft: number | null;
  trafficUsed: number | null;
  servers: { id: string; name: string }[];
  botName?: string;
  subscription: {
    id: string;
    periodDays: number;
    startsAt: string;
    endsAt: string;
  } | null;
};

const FALLBACK_APP_TITLE = 'VPN';

/** Класс для тактильного отклика кнопок (scale при нажатии) */
const BTN_TAP = 'transition-transform duration-150 active:scale-[0.98]';

export function MiniAppPage() {
  const [initData, setInitData] = useState<string>('');
  const [status, setStatus] = useState<MiniStatus | null>(null);
  const [appName, setAppName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'error' | 'success'; message: string } | null>(null);
  const [configUrl, setConfigUrl] = useState<string | null>(null);
  const [plans, setPlans] = useState<
    { id: string; name: string; price: number; currency: string; periodDays: number; description?: string | null; isTop?: boolean }[]
  >([]);
  const [payingPlanId, setPayingPlanId] = useState<string | null>(null);
  const [servers, setServers] = useState<{ id: string; name: string; freeSlots?: number | null; isRecommended?: boolean }[]>([]);
  const [screen, setScreen] = useState<'home' | 'config' | 'plans'>('home');
  const [activatingServerId, setActivatingServerId] = useState<string | null>(null);
  const [refreshingServers, setRefreshingServers] = useState(false);
  const [configCopied, setConfigCopied] = useState(false);
  const [themeVersion, setThemeVersion] = useState(0);
  const [safeArea, setSafeArea] = useState<{ top: number; bottom: number; left: number; right: number } | null>(null);
  const [screenEntered, setScreenEntered] = useState(true);

  useEffect(() => {
    setScreenEntered(false);
    const t = setTimeout(() => setScreenEntered(true), 30);
    return () => clearTimeout(t);
  }, [screen]);

  const getInitDataFromUrl = () => {
    try {
      // Telegram может прокидывать initData как tgWebAppData в query/hash
      const url = new URL(window.location.href);
      const fromQuery = url.searchParams.get('tgWebAppData');
      if (fromQuery) return fromQuery;

      const hash = url.hash?.startsWith('#') ? url.hash.slice(1) : url.hash;
      if (hash) {
        const params = new URLSearchParams(hash);
        const fromHash = params.get('tgWebAppData');
        if (fromHash) return fromHash;
      }
    } catch {
      // ignore
    }
    return '';
  };

  const tg = window.Telegram?.WebApp;
  const theme = useMemo(() => {
    const tp = tg?.themeParams || {};
    const get = (snake: string, camel: string) => (tp as any)[snake] ?? (tp as any)[camel];
    return {
      bg: get('bg_color', 'bgColor') ?? '#0b1220',
      secondaryBg: get('secondary_bg_color', 'secondaryBgColor') ?? '#0f172a',
      text: get('text_color', 'textColor') ?? '#ffffff',
      hint: get('hint_color', 'hintColor') ?? '#94a3b8',
      link: get('link_color', 'linkColor') ?? '#60a5fa',
      button: get('button_color', 'buttonColor') ?? '#6366f1',
      buttonText: get('button_text_color', 'buttonTextColor') ?? '#ffffff',
      destructive: get('destructive_text_color', 'destructiveTextColor') ?? '#ef4444',
    };
  }, [tg?.themeParams, themeVersion]);

  // Safe area: contentSafeAreaInset (Bot API 8.0+) — область без перекрытия UI Telegram; иначе safeAreaInset
  useEffect(() => {
    const w = window.Telegram?.WebApp;
    if (!w) return;
    const content = (w as any).contentSafeAreaInset;
    const device = (w as any).safeAreaInset;
    const ins = content ?? device;
    if (ins && typeof ins.top === 'number') {
      setSafeArea({
        top: ins.top ?? 0,
        bottom: ins.bottom ?? 0,
        left: ins.left ?? 0,
        right: ins.right ?? 0,
      });
    }
    const onSafe = () => {
      const c = (window.Telegram?.WebApp as any)?.contentSafeAreaInset;
      const d = (window.Telegram?.WebApp as any)?.safeAreaInset;
      const i = c ?? d;
      if (i && typeof i.top === 'number')
        setSafeArea({ top: i.top ?? 0, bottom: i.bottom ?? 0, left: i.left ?? 0, right: i.right ?? 0 });
    };
    try {
      w.onEvent?.('safeAreaChanged', onSafe);
      w.onEvent?.('contentSafeAreaChanged', onSafe);
    } catch {
      // ignore
    }
    return () => {
      try {
        w.offEvent?.('safeAreaChanged', onSafe);
        w.offEvent?.('contentSafeAreaChanged', onSafe);
      } catch {
        // ignore
      }
    };
  }, []);

  // Тема в реальном времени (themeChanged) и цвет заголовка/фона для fullscreen
  useEffect(() => {
    const w = window.Telegram?.WebApp;
    if (!w) return;
    const onTheme = () => setThemeVersion((v) => v + 1);
    try {
      w.onEvent?.('themeChanged', onTheme);
    } catch {
      // ignore
    }
    return () => {
      try {
        w.offEvent?.('themeChanged', onTheme);
      } catch {
        // ignore
      }
    };
  }, []);

  useEffect(() => {
    const w = window.Telegram?.WebApp;
    if (!w || !theme.bg) return;
    try {
      w.setHeaderColor?.(theme.bg);
      w.setBackgroundColor?.(theme.bg);
    } catch {
      // ignore
    }
  }, [theme.bg]);

  // Отступы по документации: content safe area / device safe area; fallback — env() + минимум
  const containerSafeStyle = useMemo(() => {
    if (safeArea) {
      const extraTop = 16;
      return {
        paddingTop: safeArea.top + extraTop,
        paddingBottom: safeArea.bottom + 24,
        paddingLeft: safeArea.left + 16,
        paddingRight: safeArea.right + 16,
      };
    }
    return {
      paddingTop: 'max(48px, calc(env(safe-area-inset-top, 0px) + 28px))',
      paddingBottom: 24,
      paddingLeft: 16,
      paddingRight: 16,
    };
  }, [safeArea]);

  useEffect(() => {
    // Инициализируем WebApp UI (у некоторых клиентов initData появляется после ready)
    try {
      tg?.ready?.();
      tg?.expand?.();
    } catch {
      // ignore
    }

    // Название приложения с API (для заглушки и шапки), без авторизации
    api.get<{ botName?: string }>('/public/meta').then((r) => setAppName(r.data?.botName ?? null)).catch(() => {});

    const resolveInitData = async () => {
      // 1) Пробуем из Telegram WebApp API (с небольшим ожиданием)
      for (let i = 0; i < 5; i++) {
        const v = (tg?.initData as string) || '';
        if (v) return v;
        await new Promise((r) => setTimeout(r, 200));
      }

      // 2) Фоллбек: пробуем из URL (tgWebAppData)
      const fromUrl = getInitDataFromUrl();
      if (fromUrl) return fromUrl;

      return '';
    };

    const loadStatus = async () => {
      try {
        const resolved = await resolveInitData();
        if (!resolved) {
          setFatalError(
            'Откройте это мини‑приложение из Telegram.\n\n' +
              'Если вы открыли ссылку в браузере, авторизация не сработает — используйте кнопку WebApp в боте.',
          );
          setLoading(false);
          return;
        }

        setInitData(resolved);
        const res = await api.post('/mini/status', { initData: resolved });
        setStatus(res.data);

        // Подгружаем список локаций в фоне — чтобы показывать их сразу на главном экране.
        try {
          setRefreshingServers(true);
          const sres = await api.post('/mini/servers', { initData: resolved });
          setServers(sres.data || []);
        } catch {
          // best-effort
        } finally {
          setRefreshingServers(false);
        }
      } catch (e: any) {
        console.error(e);
        setFatalError(e?.response?.data?.message || 'Не удалось загрузить статус.');
      } finally {
        setLoading(false);
      }
    };

    loadStatus();
  }, []);

  const handleLoadConfig = async () => {
    if (!initData) return;
    setToast(null);
    setConfigUrl(null);
    try {
      const res = await api.post('/mini/config', { initData });
      const cfg = res.data?.configs?.[0];
      if (!cfg || !cfg.url) {
        setToast({ type: 'error', message: 'Конфигурация недоступна. Сначала выберите и активируйте локацию.' });
        return;
      }
      setConfigUrl(cfg.url);
      setScreen('config');
    } catch (e: any) {
      console.error(e);
      setToast({ type: 'error', message: e?.response?.data?.message || 'Не удалось получить конфигурацию.' });
    }
  };

  const handleLoadPlans = async () => {
    if (!initData) return;
    setToast(null);
    try {
      const res = await api.post('/mini/plans', { initData });
      setPlans(res.data || []);
      setScreen('plans');
    } catch (e: any) {
      console.error(e);
      setToast({ type: 'error', message: e?.response?.data?.message || 'Не удалось загрузить тарифы.' });
    }
  };

  const handleRefreshServers = async () => {
    if (!initData) return;
    setToast(null);
    try {
      setRefreshingServers(true);
      const res = await api.post('/mini/servers', { initData });
      setServers(res.data || []);
    } catch (e: any) {
      console.error(e);
      setToast({ type: 'error', message: e?.response?.data?.message || 'Не удалось загрузить список локаций.' });
    } finally {
      setRefreshingServers(false);
    }
  };

  const handleActivateServer = async (serverId: string) => {
    if (!initData) return;
    setToast(null);
    setActivatingServerId(serverId);
    try {
      const res = await api.post('/mini/activate', { initData, serverId });
      setStatus(res.data);
      tg?.HapticFeedback?.notificationOccurred?.('success');
    } catch (e: any) {
      console.error(e);
      setToast({ type: 'error', message: e?.response?.data?.message || 'Не удалось активировать локацию.' });
      tg?.HapticFeedback?.notificationOccurred?.('error');
    } finally {
      setActivatingServerId(null);
    }
  };

  const handlePay = async (planId: string) => {
    if (!initData) {
      setToast({ type: 'error', message: 'Сессия истекла. Закройте и откройте приложение снова.' });
      return;
    }
    setToast(null);
    setPayingPlanId(planId);
    try {
      await api.post('/mini/pay', { initData, planId });
      await handleLoadStatusSilent();
      tg?.HapticFeedback?.notificationOccurred?.('success');
      setToast({ type: 'success', message: 'Оплата прошла. Подписка продлена.' });
      setTimeout(() => setToast(null), 4000);
    } catch (e: any) {
      console.error(e);
      setToast({ type: 'error', message: e?.response?.data?.message || 'Не удалось выполнить оплату.' });
    } finally {
      setPayingPlanId(null);
    }
  };

  const handleLoadStatusSilent = async () => {
    if (!initData) return;
    try {
      const res = await api.post('/mini/status', { initData });
      setStatus(res.data);
    } catch (e) {
      // игнорируем, это фоновое обновление
      console.error(e);
    }
  };

  const hasActiveServer = Boolean(status?.servers?.length);
  const activeServerId = status?.servers?.[0]?.id ?? null;

  const handleCopyConfig = async () => {
    if (!configUrl) return;
    try {
      await navigator.clipboard.writeText(configUrl);
      setConfigCopied(true);
      setTimeout(() => setConfigCopied(false), 2000);
    } catch (e) {
      console.error(e);
      setToast({ type: 'error', message: 'Не удалось скопировать' });
    }
  };

  // Native BackButton
  useEffect(() => {
    const back = tg?.BackButton;
    if (!back) return;

    const shouldShow = screen !== 'home';
    try {
      if (shouldShow) back.show?.();
      else back.hide?.();
    } catch {
      // ignore
    }

    const handler = () => {
      setScreen('home');
      setConfigUrl(null);
    };

    try {
      back.onClick?.(handler);
    } catch {
      // ignore
    }

    return () => {
      try {
        back.offClick?.(handler);
      } catch {
        // ignore
      }
    };
  }, [screen]);

  if (loading) {
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

  if (fatalError) {
    return (
      <div
        className="min-h-screen flex items-center justify-center px-4"
        style={{
          background: theme.bg,
          color: theme.text,
          paddingTop: 'max(48px, calc(env(safe-area-inset-top, 0px) + 28px))',
        }}
      >
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-semibold mb-4">{appName || FALLBACK_APP_TITLE}</h1>
          <p className="mb-4 whitespace-pre-wrap" style={{ color: theme.destructive }}>{fatalError}</p>
          <p className="text-sm" style={{ color: theme.hint }}>
            Убедитесь, что открываете мини‑приложение через кнопку в Telegram‑боте.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        background: theme.bg,
        color: theme.text,
        ...containerSafeStyle,
      }}
    >
      <header className="shrink-0 pt-12 pb-5 border-b max-w-md mx-auto w-full px-4" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="" className="w-12 h-12 shrink-0 rounded-xl object-contain" />
          <div>
            <h1 className="text-2xl font-bold">{status?.botName || appName || FALLBACK_APP_TITLE}</h1>
            <p className="text-sm mt-0.5" style={{ color: theme.hint }}>
              Ваш доступ к VPN и подписке прямо в Telegram.
            </p>
          </div>
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
        <div
          className={`max-w-md mx-auto w-full py-6 mt-auto mb-auto ${screen === 'home' ? 'space-y-5' : 'space-y-8'}`}
          style={{
            opacity: screenEntered ? 1 : 0,
            transition: 'opacity 0.2s ease-out',
          }}
        >
        {toast ? (
          <div
            className="rounded-2xl border px-4 py-3 text-sm whitespace-pre-wrap"
            style={{
              borderColor: toast.type === 'error' ? theme.destructive : theme.link,
              color: toast.type === 'error' ? theme.destructive : theme.link,
              background: theme.secondaryBg,
            }}
          >
            {toast.type === 'success' ? '✓ ' : ''}{toast.message}
          </div>
        ) : null}

        {/* HOME */}
        {screen === 'home' && status && (
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
                <span className="text-sm" style={{ color: theme.hint }}>Статус аккаунта</span>
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
                  {status.status === 'NEW' && '🆕 Без подписки'}
                  {status.status === 'ACTIVE' && '✅ ACTIVE'}
                  {status.status === 'BLOCKED' && '🚫 BLOCKED'}
                  {status.status === 'EXPIRED' && '⏰ EXPIRED'}
                </span>
              </div>

              {status.expiresAt ? (
                <>
                  <div className="flex items-center justify-between text-sm">
                    <span style={{ color: theme.hint }}>Действует до</span>
                    <span>
                      {new Date(status.expiresAt).toLocaleDateString('ru-RU')} {status.daysLeft !== null && `(${status.daysLeft} дн.)`}
                    </span>
                  </div>
                  {status.subscription?.startsAt && status.subscription?.endsAt ? (
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${(() => {
                            const now = Date.now();
                            const starts = new Date(status.subscription!.startsAt).getTime();
                            const ends = new Date(status.subscription!.endsAt).getTime();
                            if (!Number.isFinite(starts) || !Number.isFinite(ends) || ends <= starts) return 0;
                            const total = ends - starts;
                            const left = Math.max(0, ends - now);
                            const pct = (left / total) * 100;
                            return Math.max(0, Math.min(100, pct));
                          })()}%`,
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
                    <div style={{ color: theme.hint }} className="mb-1">Активная локация</div>
                    <div className="font-medium">{status.servers[0].name}</div>
                  </div>
                </div>
              ) : (
                <p className="text-sm" style={{ color: theme.hint }}>
                  У вас пока нет активной локации. Выберите её ниже.
                </p>
              )}
            </section>

            <section className="rounded-2xl border p-4 space-y-4" style={{ borderColor: 'rgba(255,255,255,0.12)', background: theme.secondaryBg }}>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">Локации</h2>
                <button
                  onClick={handleRefreshServers}
                  disabled={refreshingServers}
                  className={`text-xs disabled:opacity-60 disabled:cursor-not-allowed ${BTN_TAP}`}
                  style={{ color: theme.link }}
                >
                  {refreshingServers ? 'Обновление…' : 'Обновить'}
                </button>
              </div>

              {servers.length === 0 ? (
                <div className="text-sm" style={{ color: theme.hint }}>
                  Локации не загружены. Нажмите «Обновить».
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
                    const slotsText = s.freeSlots != null ? `мест: ${s.freeSlots}` : null;
                    return (
                      <button
                        key={s.id}
                        disabled={isBusy || isActive}
                        onClick={() => handleActivateServer(s.id)}
                        className={`w-full text-left px-4 py-3.5 transition-colors duration-200 disabled:opacity-60 disabled:cursor-not-allowed ${BTN_TAP}`}
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
                              background: isActive ? theme.button + '55' : isRecommended ? theme.button + '22' : 'rgba(255,255,255,0.08)',
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
                                      Активна
                                    </span>
                                  ) : isRecommended ? (
                                    <span
                                      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
                                      style={{ background: theme.button + '33', color: theme.text, border: '1px solid ' + theme.button + '66' }}
                                    >
                                      Рекомендуем
                                    </span>
                                  ) : null}
                                </div>
                                <div className="text-[11px] mt-0.5" style={{ color: theme.hint }}>
                                  {isBusy ? 'Подключаем…' : isActive ? 'Подключено' : 'Нажмите, чтобы подключить'}
                                </div>
                              </div>

                              <div className="shrink-0 flex items-center gap-2">
                                {slotsText ? (
                                  <span
                                    className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
                                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', color: theme.hint }}
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

            <section className="rounded-2xl border p-4 space-y-4" style={{ borderColor: 'rgba(255,255,255,0.12)', background: theme.secondaryBg }}>
              <h2 className="text-sm font-semibold">Конфигурация</h2>
              <button
                onClick={handleLoadConfig}
                disabled={!hasActiveServer}
                className={`w-full inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed ${BTN_TAP}`}
                style={{ background: theme.button, color: theme.buttonText }}
              >
                📥 Получить конфиг
              </button>
              {!hasActiveServer ? (
                <div className="text-xs" style={{ color: theme.hint }}>
                  Сначала выберите локацию.
                </div>
              ) : null}
            </section>

            <section className="rounded-2xl border p-4 space-y-4" style={{ borderColor: 'rgba(255,255,255,0.12)', background: theme.secondaryBg }}>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">Тарифы</h2>
                <button onClick={handleLoadPlans} className={`text-xs ${BTN_TAP}`} style={{ color: theme.link }}>
                  Открыть
                </button>
              </div>
              <p className="text-sm" style={{ color: theme.hint }}>
                Оплата и продление подписки.
              </p>
            </section>
          </>
        )}

        {/* Список локаций теперь показывается на home (без отдельного экрана и подтверждения) */}

        {/* CONFIG */}
        {screen === 'config' && (
          <section className="rounded-2xl border p-4 space-y-4" style={{ borderColor: 'rgba(255,255,255,0.12)', background: theme.secondaryBg }}>
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">Конфигурация</div>
              <button
                onClick={() => {
                  setScreen('home');
                  setConfigUrl(null);
                }}
                className={`text-xs ${BTN_TAP}`}
                style={{ color: theme.link }}
              >
                Назад
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
                  onClick={handleCopyConfig}
                  className={`w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all duration-200 ${BTN_TAP} ${configCopied ? 'scale-[0.98] opacity-90' : ''}`}
                  style={{ background: configCopied ? 'rgba(34,197,94,0.3)' : theme.button, color: theme.buttonText }}
                >
                  {configCopied ? '✓ Скопировано' : '📋 Копировать конфиг'}
                </button>
              </div>
            ) : (
              <p className="text-sm" style={{ color: theme.hint }}>
                Конфиг не загружен.
              </p>
            )}
          </section>
        )}

        {/* PLANS */}
        {screen === 'plans' && (
          <section className="rounded-2xl border p-4 space-y-4" style={{ borderColor: 'rgba(255,255,255,0.12)', background: theme.secondaryBg }}>
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">Тарифы</div>
              <div className="flex items-center gap-3">
                <button onClick={handleLoadPlans} className={`text-xs ${BTN_TAP}`} style={{ color: theme.link }}>
                  Обновить
                </button>
                <button onClick={() => setScreen('home')} className={`text-xs ${BTN_TAP}`} style={{ color: theme.link }}>
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
                        background: isTop ? `linear-gradient(135deg, rgba(99,102,241,0.15) 0%, rgba(255,255,255,0.06) 100%)` : 'rgba(255,255,255,0.06)',
                        border: `1px solid ${isTop ? theme.button + '80' : 'rgba(255,255,255,0.1)'}`,
                        boxShadow: isTop ? `0 4px 16px rgba(0,0,0,0.2)` : 'none',
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-base" style={{ color: theme.text }}>{p.name}</span>
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
                            <p className="mt-2 text-xs leading-snug" style={{ color: theme.hint }}>{p.description}</p>
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
                              handlePay(p.id);
                            }}
                            disabled={payingPlanId === p.id}
                            className={`mt-2 inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed ${BTN_TAP}`}
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
        )}
        </div>
      </div>

      <footer className="shrink-0 pt-5 pb-5 text-center text-xs border-t" style={{ color: theme.hint, borderColor: 'rgba(255,255,255,0.08)' }}>
        <a href="/privacy" style={{ color: theme.link }} target="_blank" rel="noreferrer">
          Политика конфиденциальности
        </a>
        <span className="px-2">·</span>
        <a href="/terms" style={{ color: theme.link }} target="_blank" rel="noreferrer">
          Пользовательское соглашение
        </a>
      </footer>
    </div>
  );
}


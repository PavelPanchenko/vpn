import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { QRCodeSVG } from 'qrcode.react';

declare global {
  interface Window {
    Telegram?: any;
  }
}

type MiniStatus = {
  status: string;
  expiresAt: string | null;
  daysLeft: number | null;
  servers: { id: string; name: string }[];
  subscription: {
    id: string;
    periodDays: number;
    startsAt: string;
    endsAt: string;
  } | null;
};

export function MiniAppPage() {
  const [initData, setInitData] = useState<string>('');
  const [status, setStatus] = useState<MiniStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [toastError, setToastError] = useState<string | null>(null);
  const [configUrl, setConfigUrl] = useState<string | null>(null);
  const [plans, setPlans] = useState<
    { id: string; name: string; price: number; currency: string; periodDays: number }[]
  >([]);
  const [payingPlanId, setPayingPlanId] = useState<string | null>(null);
  const [servers, setServers] = useState<{ id: string; name: string }[]>([]);
  const [screen, setScreen] = useState<'home' | 'servers' | 'confirm' | 'config' | 'plans'>('home');
  const [selectedServer, setSelectedServer] = useState<{ id: string; name: string } | null>(null);

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
  }, [tg?.themeParams]);

  useEffect(() => {
    // Инициализируем WebApp UI (у некоторых клиентов initData появляется после ready)
    try {
      tg?.ready?.();
      tg?.expand?.();
    } catch {
      // ignore
    }

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
    setToastError(null);
    setConfigUrl(null);
    try {
      const res = await api.post('/mini/config', { initData });
      const cfg = res.data?.configs?.[0];
      if (!cfg || !cfg.url) {
        setToastError('Конфигурация недоступна. Сначала выберите и активируйте локацию.');
        return;
      }
      setConfigUrl(cfg.url);
      setScreen('config');
    } catch (e: any) {
      console.error(e);
      setToastError(e?.response?.data?.message || 'Не удалось получить конфигурацию.');
    }
  };

  const handleLoadPlans = async () => {
    if (!initData) return;
    setToastError(null);
    try {
      const res = await api.post('/mini/plans', { initData });
      setPlans(res.data || []);
      setScreen('plans');
    } catch (e: any) {
      console.error(e);
      setToastError(e?.response?.data?.message || 'Не удалось загрузить тарифы.');
    }
  };

  const handleLoadServers = async () => {
    if (!initData) return;
    setToastError(null);
    try {
      const res = await api.post('/mini/servers', { initData });
      setServers(res.data || []);
      setScreen('servers');
    } catch (e: any) {
      console.error(e);
      setToastError(e?.response?.data?.message || 'Не удалось загрузить список локаций.');
    }
  };

  const handleActivateServer = async () => {
    if (!initData || !selectedServer) return;
    setToastError(null);
    try {
      const res = await api.post('/mini/activate', { initData, serverId: selectedServer.id });
      setStatus(res.data);
      setSelectedServer(null);
      setScreen('home');
    } catch (e: any) {
      console.error(e);
      setToastError(e?.response?.data?.message || 'Не удалось активировать локацию.');
    }
  };

  const handlePay = async (planId: string) => {
    if (!initData) return;
    setToastError(null);
    setPayingPlanId(planId);
    try {
      await api.post('/mini/pay', { initData, planId });
      await handleLoadStatusSilent();
    } catch (e: any) {
      console.error(e);
      setToastError(e?.response?.data?.message || 'Не удалось выполнить оплату.');
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
      if (screen === 'confirm') {
        setScreen('servers');
        return;
      }
      setScreen('home');
      setSelectedServer(null);
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
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: theme.bg, color: theme.text }}>
        <div className="text-lg">Загрузка...</div>
      </div>
    );
  }

  if (fatalError) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: theme.bg, color: theme.text }}>
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-semibold mb-4">Mini VPN</h1>
          <p className="mb-4 whitespace-pre-wrap" style={{ color: theme.destructive }}>{fatalError}</p>
          <p className="text-sm" style={{ color: theme.hint }}>
            Убедитесь, что открываете мини‑приложение через кнопку в Telegram‑боте.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-6" style={{ background: theme.bg, color: theme.text }}>
      <div className="max-w-md mx-auto space-y-6">
        <header>
          <h1 className="text-2xl font-bold">Mini VPN</h1>
          <p className="text-sm mt-1" style={{ color: theme.hint }}>
            Ваш доступ к VPN и подписке прямо в Telegram.
          </p>
        </header>

        {toastError ? (
          <div className="rounded-2xl border px-4 py-3 text-sm whitespace-pre-wrap" style={{ borderColor: theme.destructive, color: theme.destructive, background: theme.secondaryBg }}>
            {toastError}
          </div>
        ) : null}

        {/* HOME */}
        {screen === 'home' && status && (
          <>
            <section className="rounded-2xl border p-4 space-y-2" style={{ borderColor: 'rgba(255,255,255,0.12)', background: theme.secondaryBg }}>
              <div className="flex items-center justify-between">
                <span className="text-sm" style={{ color: theme.hint }}>Статус аккаунта</span>
                <span className="text-sm font-medium">
                  {status.status === 'ACTIVE' && '✅ ACTIVE'}
                  {status.status === 'BLOCKED' && '🚫 BLOCKED'}
                  {status.status === 'EXPIRED' && '⏰ EXPIRED'}
                </span>
              </div>

              {status.expiresAt ? (
                <div className="flex items-center justify-between text-sm">
                  <span style={{ color: theme.hint }}>Действует до</span>
                  <span>
                    {new Date(status.expiresAt).toLocaleDateString('ru-RU')} {status.daysLeft !== null && `(${status.daysLeft} дн.)`}
                  </span>
                </div>
              ) : null}

              {hasActiveServer ? (
                <div className="text-sm">
                  <div style={{ color: theme.hint }} className="mb-1">Активная локация</div>
                  <div className="font-medium">{status.servers[0].name}</div>
                </div>
              ) : (
                <p className="text-sm" style={{ color: theme.hint }}>
                  У вас пока нет активной локации. Выберите её ниже.
                </p>
              )}
            </section>

            <section className="rounded-2xl border p-4 space-y-3" style={{ borderColor: 'rgba(255,255,255,0.12)', background: theme.secondaryBg }}>
              <h2 className="text-sm font-semibold">Локация</h2>
              <button
                onClick={handleLoadServers}
                className="w-full inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium transition"
                style={{ background: theme.button, color: theme.buttonText }}
              >
                📍 {hasActiveServer ? 'Выбрать другую локацию' : 'Выбрать локацию'}
              </button>
            </section>

            <section className="rounded-2xl border p-4 space-y-3" style={{ borderColor: 'rgba(255,255,255,0.12)', background: theme.secondaryBg }}>
              <h2 className="text-sm font-semibold">Конфигурация</h2>
              <button
                onClick={handleLoadConfig}
                disabled={!hasActiveServer}
                className="w-full inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium transition disabled:opacity-60 disabled:cursor-not-allowed"
                style={{ background: theme.button, color: theme.buttonText }}
              >
                📥 Получить конфиг
              </button>
              {!hasActiveServer ? (
                <div className="text-xs" style={{ color: theme.hint }}>
                  Сначала выберите и подтвердите локацию.
                </div>
              ) : null}
            </section>

            <section className="rounded-2xl border p-4 space-y-3" style={{ borderColor: 'rgba(255,255,255,0.12)', background: theme.secondaryBg }}>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">Тарифы</h2>
                <button onClick={handleLoadPlans} className="text-xs" style={{ color: theme.link }}>
                  Открыть
                </button>
              </div>
              <p className="text-sm" style={{ color: theme.hint }}>
                Оплата и продление подписки.
              </p>
            </section>
          </>
        )}

        {/* SERVERS */}
        {screen === 'servers' && (
          <section className="rounded-2xl border p-4 space-y-3" style={{ borderColor: 'rgba(255,255,255,0.12)', background: theme.secondaryBg }}>
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">Выберите локацию</div>
              <button onClick={() => setScreen('home')} className="text-xs" style={{ color: theme.link }}>
                Назад
              </button>
            </div>

            {servers.length === 0 ? (
              <p className="text-sm" style={{ color: theme.hint }}>Нет доступных локаций.</p>
            ) : (
              <div className="space-y-2">
                {servers.map((s: { id: string; name: string }) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      setSelectedServer(s);
                      setScreen('confirm');
                    }}
                    className="w-full inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium transition"
                    style={{ background: 'rgba(255,255,255,0.08)', color: theme.text }}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {/* CONFIRM */}
        {screen === 'confirm' && selectedServer && (
          <section className="rounded-2xl border p-4 space-y-3" style={{ borderColor: 'rgba(255,255,255,0.12)', background: theme.secondaryBg }}>
            <div className="text-sm font-semibold">Подтверждение</div>
            <p className="text-sm" style={{ color: theme.hint }}>
              Локация: <span className="font-medium" style={{ color: theme.text }}>{selectedServer.name}</span>
            </p>
            <p className="text-xs" style={{ color: theme.hint }}>
              При первом подключении вы получите пробный период на 3 дня.
            </p>
            <div className="grid gap-2">
              <button
                onClick={handleActivateServer}
                className="w-full inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium transition"
                style={{ background: theme.button, color: theme.buttonText }}
              >
                ✅ Подтвердить и подключить
              </button>
              <button
                onClick={() => setScreen('servers')}
                className="w-full inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium transition"
                style={{ background: 'rgba(255,255,255,0.08)', color: theme.text }}
              >
                🔙 Назад
              </button>
            </div>
          </section>
        )}

        {/* CONFIG */}
        {screen === 'config' && (
          <section className="rounded-2xl border p-4 space-y-3" style={{ borderColor: 'rgba(255,255,255,0.12)', background: theme.secondaryBg }}>
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">Конфигурация</div>
              <button
                onClick={() => {
                  setScreen('home');
                  setConfigUrl(null);
                }}
                className="text-xs"
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
          <section className="rounded-2xl border p-4 space-y-3" style={{ borderColor: 'rgba(255,255,255,0.12)', background: theme.secondaryBg }}>
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">Тарифы</div>
              <button onClick={() => setScreen('home')} className="text-xs" style={{ color: theme.link }}>
                Назад
              </button>
            </div>

            <div className="flex items-center justify-between">
              <button onClick={handleLoadPlans} className="text-xs" style={{ color: theme.link }}>
                Обновить
              </button>
            </div>

            {plans.length === 0 ? (
              <p className="text-sm" style={{ color: theme.hint }}>
                Нажмите «Обновить», чтобы загрузить доступные тарифы.
              </p>
            ) : (
              <div className="space-y-2">
                {plans.map((p: { id: string; name: string; price: number; currency: string; periodDays: number }) => (
                  <div
                    key={p.id}
                    className="rounded-xl px-3 py-2 flex items-center justify-between text-sm"
                    style={{ background: 'rgba(255,255,255,0.08)' }}
                  >
                    <div>
                      <div className="font-medium">{p.name}</div>
                      <div style={{ color: theme.hint }}>
                        {p.price} {p.currency} · {p.periodDays} дн.
                      </div>
                    </div>
                    <button
                      onClick={() => handlePay(p.id)}
                      disabled={payingPlanId === p.id}
                      className="inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                      style={{ background: theme.button, color: theme.buttonText }}
                    >
                      {payingPlanId === p.id ? 'Оплата...' : 'Оплатить'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}


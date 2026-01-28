import { useEffect, useState } from 'react';
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
  const [error, setError] = useState<string | null>(null);
  const [configUrl, setConfigUrl] = useState<string | null>(null);
  const [plans, setPlans] = useState<
    { id: string; name: string; price: number; currency: string; periodDays: number }[]
  >([]);
  const [payingPlanId, setPayingPlanId] = useState<string | null>(null);

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

  useEffect(() => {
    const tg = window.Telegram?.WebApp;

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
          setError(
            'Откройте это мини‑приложение из Telegram.\n\n' +
              'Если вы открыли ссылку в браузере, авторизация не сработает — используйте кнопку WebApp в боте.',
          );
          return;
        }

        setInitData(resolved);
        const res = await api.post('/mini/status', { initData: resolved });
        setStatus(res.data);
      } catch (e: any) {
        console.error(e);
        setError(e?.response?.data?.message || 'Не удалось загрузить статус.');
      } finally {
        setLoading(false);
      }
    };

    loadStatus();
  }, []);

  const handleLoadConfig = async () => {
    if (!initData) return;
    setError(null);
    setConfigUrl(null);
    try {
      const res = await api.post('/mini/config', { initData });
      const cfg = res.data?.configs?.[0];
      if (!cfg || !cfg.url) {
        setError('Конфигурация недоступна. Убедитесь, что у вас есть активный сервер.');
        return;
      }
      setConfigUrl(cfg.url);
    } catch (e: any) {
      console.error(e);
      setError(e?.response?.data?.message || 'Не удалось получить конфигурацию.');
    }
  };

  const handleLoadPlans = async () => {
    if (!initData) return;
    setError(null);
    try {
      const res = await api.post('/mini/plans', { initData });
      setPlans(res.data || []);
    } catch (e: any) {
      console.error(e);
      setError(e?.response?.data?.message || 'Не удалось загрузить тарифы.');
    }
  };

  const handlePay = async (planId: string) => {
    if (!initData) return;
    setError(null);
    setPayingPlanId(planId);
    try {
      await api.post('/mini/pay', { initData, planId });
      await handleLoadStatusSilent();
    } catch (e: any) {
      console.error(e);
      setError(e?.response?.data?.message || 'Не удалось выполнить оплату.');
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
        <div className="text-lg">Загрузка...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white px-4">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-semibold mb-4">Mini VPN</h1>
          <p className="text-red-400 mb-4 whitespace-pre-wrap">{error}</p>
          <p className="text-slate-400 text-sm">
            Убедитесь, что открываете мини‑приложение через кнопку в Telegram‑боте.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white px-4 py-6">
      <div className="max-w-md mx-auto space-y-6">
        <header>
          <h1 className="text-2xl font-bold">Mini VPN</h1>
          <p className="text-slate-400 text-sm mt-1">
            Ваш доступ к VPN и подписке прямо в Telegram.
          </p>
        </header>

        {status && (
          <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-400">Статус аккаунта</span>
              <span className="text-sm font-medium">
                {status.status === 'ACTIVE' && '✅ ACTIVE'}
                {status.status === 'BLOCKED' && '🚫 BLOCKED'}
                {status.status === 'EXPIRED' && '⏰ EXPIRED'}
              </span>
            </div>

            {status.expiresAt && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">Действует до</span>
                <span>
                  {new Date(status.expiresAt).toLocaleDateString('ru-RU')}{' '}
                  {status.daysLeft !== null && `(${status.daysLeft} дн.)`}
                </span>
              </div>
            )}

            {status.servers.length > 0 ? (
              <div className="text-sm">
                <div className="text-slate-400 mb-1">Активные локации</div>
                <ul className="list-disc list-inside space-y-0.5">
                  {status.servers.map((s) => (
                    <li key={s.id}>{s.name}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-slate-400">
                У вас пока нет активных серверов. Выберите локацию в боте.
              </p>
            )}
          </section>
        )}

        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
          <h2 className="text-sm font-semibold text-slate-200">Конфигурация</h2>
          <button
            onClick={handleLoadConfig}
            className="w-full inline-flex items-center justify-center rounded-xl bg-indigo-500 hover:bg-indigo-400 px-4 py-2 text-sm font-medium transition"
          >
            📥 Получить конфиг
          </button>

          {configUrl && (
            <div className="mt-3 space-y-3">
              <div className="flex justify-center">
                <div className="bg-white p-2 rounded-xl">
                  <QRCodeSVG value={configUrl} size={180} />
                </div>
              </div>
              <div className="text-xs text-slate-400">
                Отсканируйте QR‑код в приложении (v2rayNG, V2rayTun и т.п.) или скопируйте ссылку
                ниже.
              </div>
              <div className="bg-slate-950 rounded-xl p-3 text-xs break-all max-h-40 overflow-auto border border-slate-800">
                {configUrl}
              </div>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-200">Тарифы</h2>
            <button
              onClick={handleLoadPlans}
              className="text-xs text-indigo-400 hover:text-indigo-300"
            >
              Обновить
            </button>
          </div>

          {plans.length === 0 ? (
            <p className="text-sm text-slate-400">
              Нажмите «Обновить», чтобы загрузить доступные тарифы.
            </p>
          ) : (
            <div className="space-y-2">
              {plans.map((p) => (
                <div
                  key={p.id}
                  className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 flex items-center justify-between text-sm"
                >
                  <div>
                    <div className="font-medium">{p.name}</div>
                    <div className="text-slate-400">
                      {p.price} {p.currency} · {p.periodDays} дн.
                    </div>
                  </div>
                  <button
                    onClick={() => handlePay(p.id)}
                    disabled={payingPlanId === p.id}
                    className="inline-flex items-center justify-center rounded-lg bg-emerald-500 hover:bg-emerald-400 px-3 py-1.5 text-xs font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {payingPlanId === p.id ? 'Оплата...' : 'Оплатить'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}


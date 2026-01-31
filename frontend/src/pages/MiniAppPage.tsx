import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useTelegramBackButton, useTelegramWebAppUi } from '../hooks/useTelegramWebAppUi';
import { getApiErrorMessage } from '../lib/apiError';
import {
  activateMiniServer,
  fetchMiniConfig,
  fetchMiniPlans,
  fetchMiniServers,
  fetchMiniStatus,
  payMiniPlan,
} from '../lib/miniApi';
import type { MiniPlan, MiniServer, MiniStatus } from '../lib/miniTypes';
import { MiniAppToast, type MiniToastState } from '../components/MiniAppToast';
import { MiniAppHome } from '../components/MiniAppHome';
import { MiniAppConfig } from '../components/MiniAppConfig';
import { MiniAppPlans } from '../components/MiniAppPlans';
import { MiniAppLoading } from '../components/MiniAppLoading';
import { MiniAppFatalError } from '../components/MiniAppFatalError';
import { MiniAppHeader } from '../components/MiniAppHeader';
import { MiniAppFooter } from '../components/MiniAppFooter';

function getInitDataFromUrl(): string {
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
}

const FALLBACK_APP_TITLE = 'VPN';

/** Класс для тактильного отклика кнопок (scale при нажатии) */
const BTN_TAP = 'transition-transform duration-150 active:scale-[0.98]';

export function MiniAppPage() {
  const [initData, setInitData] = useState<string>('');
  const [status, setStatus] = useState<MiniStatus | null>(null);
  const [appName, setAppName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [toast, setToast] = useState<MiniToastState>(null);
  const [configUrl, setConfigUrl] = useState<string | null>(null);
  const [plans, setPlans] = useState<MiniPlan[]>([]);
  const [payingPlanId, setPayingPlanId] = useState<string | null>(null);
  const [servers, setServers] = useState<MiniServer[]>([]);
  const [screen, setScreen] = useState<'home' | 'config' | 'plans'>('home');
  const [activatingServerId, setActivatingServerId] = useState<string | null>(null);
  const [refreshingServers, setRefreshingServers] = useState(false);
  const [configCopied, setConfigCopied] = useState(false);
  const [screenEntered, setScreenEntered] = useState(true);

  useEffect(() => {
    setScreenEntered(false);
    const t = setTimeout(() => setScreenEntered(true), 30);
    return () => clearTimeout(t);
  }, [screen]);

  const { tg, theme, containerSafeStyle, viewportHeight } = useTelegramWebAppUi();

  const showErrorToast = useCallback(
    (error: unknown, fallback: string) => {
      // eslint-disable-next-line no-console
      console.error(error);
      setToast({ type: 'error', message: getApiErrorMessage(error, fallback) });
    },
    [],
  );

  const showSuccessToast = useCallback((message: string, autoHideMs = 4000) => {
    setToast({ type: 'success', message });
    if (autoHideMs > 0) {
      setTimeout(() => setToast(null), autoHideMs);
    }
  }, []);

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
        const s = await fetchMiniStatus(resolved);
        setStatus(s);

        // Подгружаем список локаций в фоне — чтобы показывать их сразу на главном экране.
        try {
          setRefreshingServers(true);
          const list = await fetchMiniServers(resolved);
          setServers(list);
        } catch {
          // best-effort
        } finally {
          setRefreshingServers(false);
        }
      } catch (e: unknown) {
        // eslint-disable-next-line no-console
        console.error(e);
        setFatalError(getApiErrorMessage(e, 'Не удалось загрузить статус.'));
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
      const res = await fetchMiniConfig(initData);
      const cfg = res?.configs?.[0];
      if (!cfg || !cfg.url) {
        setToast({ type: 'error', message: 'Конфигурация недоступна. Сначала выберите и активируйте локацию.' });
        return;
      }
      setConfigUrl(cfg.url);
      setScreen('config');
    } catch (e: unknown) {
      showErrorToast(e, 'Не удалось получить конфигурацию.');
    }
  };

  const handleLoadPlans = async () => {
    if (!initData) return;
    setToast(null);
    try {
      const list = await fetchMiniPlans(initData);
      setPlans(list);
      setScreen('plans');
    } catch (e: unknown) {
      showErrorToast(e, 'Не удалось загрузить тарифы.');
    }
  };

  const handleRefreshServers = async () => {
    if (!initData) return;
    setToast(null);
    try {
      setRefreshingServers(true);
      const list = await fetchMiniServers(initData);
      setServers(list);
    } catch (e: unknown) {
      showErrorToast(e, 'Не удалось загрузить список локаций.');
    } finally {
      setRefreshingServers(false);
    }
  };

  const handleActivateServer = async (serverId: string) => {
    if (!initData) return;
    setToast(null);
    setActivatingServerId(serverId);
    try {
      const next = await activateMiniServer(initData, serverId);
      setStatus(next);
      tg?.HapticFeedback?.notificationOccurred?.('success');
    } catch (e: unknown) {
      showErrorToast(e, 'Не удалось активировать локацию.');
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
      await payMiniPlan(initData, planId);
      await handleLoadStatusSilent();
      tg?.HapticFeedback?.notificationOccurred?.('success');
      showSuccessToast('Оплата прошла. Подписка продлена.');
    } catch (e: unknown) {
      showErrorToast(e, 'Не удалось выполнить оплату.');
    } finally {
      setPayingPlanId(null);
    }
  };

  const handleLoadStatusSilent = async () => {
    if (!initData) return;
    try {
      const next = await fetchMiniStatus(initData);
      setStatus(next);
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

  const onBack = useCallback(() => {
    setScreen('home');
    setConfigUrl(null);
  }, []);
  useTelegramBackButton({ tg, visible: screen !== 'home', onClick: onBack });

  if (loading) {
    return <MiniAppLoading theme={theme} />;
  }

  if (fatalError) {
    return <MiniAppFatalError theme={theme} title={appName || FALLBACK_APP_TITLE} message={fatalError} />;
  }

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        background: theme.bg,
        color: theme.text,
        minHeight: viewportHeight,
        ...containerSafeStyle,
      }}
    >
      <MiniAppHeader theme={theme} title={status?.botName || appName || FALLBACK_APP_TITLE} />

      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
        <div
          className={`max-w-md mx-auto w-full py-6 mt-auto mb-auto ${screen === 'home' ? 'space-y-5' : 'space-y-8'}`}
          style={{
            opacity: screenEntered ? 1 : 0,
            transition: 'opacity 0.2s ease-out',
          }}
        >
        <MiniAppToast toast={toast} theme={theme} />

        {/* HOME */}
        {screen === 'home' && status && (
          <MiniAppHome
            theme={theme}
            btnTapClass={BTN_TAP}
            status={status}
            servers={servers}
            refreshingServers={refreshingServers}
            activatingServerId={activatingServerId}
            hasActiveServer={hasActiveServer}
            activeServerId={activeServerId}
            onRefreshServers={handleRefreshServers}
            onActivateServer={handleActivateServer}
            onOpenConfig={handleLoadConfig}
            onOpenPlans={handleLoadPlans}
          />
        )}

        {/* Список локаций теперь показывается на home (без отдельного экрана и подтверждения) */}

        {/* CONFIG */}
        {screen === 'config' && (
          <MiniAppConfig
            theme={theme}
            btnTapClass={BTN_TAP}
            configUrl={configUrl}
            configCopied={configCopied}
            onCopy={handleCopyConfig}
            onBack={() => {
              setScreen('home');
              setConfigUrl(null);
            }}
          />
        )}

        {/* PLANS */}
        {screen === 'plans' && (
          <MiniAppPlans
            theme={theme}
            btnTapClass={BTN_TAP}
            plans={plans}
            payingPlanId={payingPlanId}
            onRefresh={handleLoadPlans}
            onBack={() => setScreen('home')}
            onPay={handlePay}
          />
        )}
        </div>
      </div>

      <MiniAppFooter theme={theme} />
    </div>
  );
}


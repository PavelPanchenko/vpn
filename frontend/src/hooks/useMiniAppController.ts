import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
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
import type { MiniToastState } from '../components/MiniAppToast';
import type { TelegramWebApp } from '../lib/telegramWebAppTypes';

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

export type MiniScreen = 'home' | 'config' | 'plans';

function logDevError(error: unknown) {
  // eslint-disable-next-line no-console
  if ((import.meta as any)?.env?.DEV) console.error(error);
}

export function useMiniAppController(args: { tg: TelegramWebApp | undefined }) {
  const { tg } = args;

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
  const [screen, setScreen] = useState<MiniScreen>('home');
  const [activatingServerId, setActivatingServerId] = useState<string | null>(null);
  const [refreshingServers, setRefreshingServers] = useState(false);
  const [configCopied, setConfigCopied] = useState(false);
  const [screenEntered, setScreenEntered] = useState(true);

  const showErrorToast = useCallback((error: unknown, fallback: string) => {
    logDevError(error);
    setToast({ type: 'error', message: getApiErrorMessage(error, fallback) });
  }, []);

  const showSuccessToast = useCallback((message: string, autoHideMs = 4000) => {
    setToast({ type: 'success', message });
    if (autoHideMs > 0) {
      setTimeout(() => setToast(null), autoHideMs);
    }
  }, []);

  useEffect(() => {
    setScreenEntered(false);
    const t = setTimeout(() => setScreenEntered(true), 30);
    return () => clearTimeout(t);
  }, [screen]);

  const resolveInitData = useCallback(async (): Promise<string> => {
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
  }, [tg]);

  const loadStatusAndMaybeServers = useCallback(async () => {
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
  }, [resolveInitData]);

  useEffect(() => {
    // Инициализируем WebApp UI (у некоторых клиентов initData появляется после ready)
    try {
      tg?.ready?.();
      tg?.expand?.();
    } catch {
      // ignore
    }

    // Название приложения с API (для заглушки и шапки), без авторизации
    api
      .get<{ botName?: string }>('/public/meta')
      .then((r) => setAppName(r.data?.botName ?? null))
      .catch(() => {});

    const run = async () => {
      try {
        await loadStatusAndMaybeServers();
      } catch (e: unknown) {
        logDevError(e);
        setFatalError(getApiErrorMessage(e, 'Не удалось загрузить статус.'));
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [tg, loadStatusAndMaybeServers]);

  const handleLoadConfig = useCallback(async () => {
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
  }, [initData, showErrorToast]);

  const handleLoadPlans = useCallback(async () => {
    if (!initData) return;
    setToast(null);
    try {
      const list = await fetchMiniPlans(initData);
      setPlans(list);
      setScreen('plans');
    } catch (e: unknown) {
      showErrorToast(e, 'Не удалось загрузить тарифы.');
    }
  }, [initData, showErrorToast]);

  const handleRefreshServers = useCallback(async () => {
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
  }, [initData, showErrorToast]);

  const handleActivateServer = useCallback(
    async (serverId: string) => {
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
    },
    [initData, showErrorToast, tg],
  );

  const handleLoadStatusSilent = useCallback(async () => {
    if (!initData) return;
    try {
      const next = await fetchMiniStatus(initData);
      setStatus(next);
    } catch {
      // ignore: фоновое обновление
    }
  }, [initData]);

  const handlePay = useCallback(
    async (planId: string) => {
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
    },
    [initData, handleLoadStatusSilent, showErrorToast, showSuccessToast, tg],
  );

  const handleCopyConfig = useCallback(async () => {
    if (!configUrl) return;
    try {
      await navigator.clipboard.writeText(configUrl);
      setConfigCopied(true);
      setTimeout(() => setConfigCopied(false), 2000);
    } catch (e: unknown) {
      showErrorToast(e, 'Не удалось скопировать');
    }
  }, [configUrl, showErrorToast]);

  const hasActiveServer = useMemo(() => Boolean(status?.servers?.length), [status?.servers?.length]);
  const activeServerId = useMemo(() => status?.servers?.[0]?.id ?? null, [status?.servers]);

  const goHome = useCallback(() => {
    setScreen('home');
    setConfigUrl(null);
  }, []);

  return {
    // ui state
    appName,
    loading,
    fatalError,
    toast,
    screen,
    screenEntered,

    // data
    status,
    servers,
    plans,
    configUrl,
    configCopied,
    payingPlanId,
    activatingServerId,
    refreshingServers,
    hasActiveServer,
    activeServerId,

    // actions
    goHome,
    setScreen,
    handleLoadConfig,
    handleLoadPlans,
    handleRefreshServers,
    handleActivateServer,
    handlePay,
    handleCopyConfig,
  };
}


import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { getApiErrorMessage } from '../lib/apiError';
import {
  activateMiniServer,
  fetchMiniConfig,
  fetchMiniPlans,
  fetchMiniServers,
  fetchMiniStatus,
  getMiniBrowserLoginStatus,
  payMiniPlanWithProvider,
  startMiniBrowserLogin,
} from '../lib/miniApi';
import type { MiniPlan, MiniServer, MiniStatus } from '../lib/miniTypes';
import type { MiniToastState } from '../components/MiniAppToast';
import type { TelegramWebApp } from '../lib/telegramWebAppTypes';
import { groupPlans, type MiniPlanGroup } from '../lib/planGrouping';

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

export type MiniScreen = 'home' | 'config' | 'plans' | 'help';

function logDevError(error: unknown) {
  // eslint-disable-next-line no-console
  if ((import.meta as any)?.env?.DEV) console.error(error);
}

export function useMiniAppController(args: { tg: TelegramWebApp | undefined }) {
  const { tg } = args;

  const [initData, setInitData] = useState<string>('');
  const [standaloneGate, setStandaloneGate] = useState(false);
  const [browserLogin, setBrowserLogin] = useState<{
    loginId: string;
    expiresAt: string;
    deepLink: string | null;
    status: 'PENDING' | 'EXPIRED';
  } | null>(null);
  const [status, setStatus] = useState<MiniStatus | null>(null);
  const [appName, setAppName] = useState<string | null>(null);
  const [publicMeta, setPublicMeta] = useState<{
    botName?: string | null;
    botUsername?: string | null;
    companyName?: string | null;
    supportEmail?: string | null;
    supportTelegram?: string | null;
    siteUrl?: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [toast, setToast] = useState<MiniToastState>(null);
  const [configUrl, setConfigUrl] = useState<string | null>(null);
  const [plans, setPlans] = useState<MiniPlan[]>([]);
  const [payingPlanKey, setPayingPlanKey] = useState<string | null>(null);
  const [servers, setServers] = useState<MiniServer[]>([]);
  const [screen, setScreen] = useState<MiniScreen>('home');
  const [activatingServerId, setActivatingServerId] = useState<string | null>(null);
  const [refreshingServers, setRefreshingServers] = useState(false);
  const [configCopied, setConfigCopied] = useState(false);
  const [screenEntered, setScreenEntered] = useState(true);

  const [paymentSheetOpen, setPaymentSheetOpen] = useState(false);
  const [selectedPlanGroupKey, setSelectedPlanGroupKey] = useState<string | null>(null);

  const planGroups: MiniPlanGroup[] = useMemo(() => groupPlans(plans), [plans]);
  const selectedPlanGroup = useMemo(
    () => (selectedPlanGroupKey ? planGroups.find((g) => g.key === selectedPlanGroupKey) ?? null : null),
    [planGroups, selectedPlanGroupKey],
  );

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
    // 3) Standalone режим: из sessionStorage (если пользователь уже вставлял)
    try {
      const saved = window.sessionStorage?.getItem('miniInitData') ?? '';
      if (saved) return saved;
    } catch {
      // ignore
    }
    return '';
  }, [tg]);

  const bootstrapWithInitData = useCallback(async (resolved: string) => {
    setInitData(resolved);
    try {
      window.sessionStorage?.setItem('miniInitData', resolved);
    } catch {
      // ignore
    }

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
  }, []);

  const loadStatusAndMaybeServers = useCallback(async () => {
    const resolved = await resolveInitData();
    if (!resolved) {
      // Standalone режим: не падаем, а показываем gate для ручного ввода initData
      setStandaloneGate(true);
      try {
        const s = await startMiniBrowserLogin();
        setBrowserLogin({ loginId: s.loginId, expiresAt: s.expiresAt, deepLink: s.deepLink, status: 'PENDING' });
      } catch {
        // best-effort: остаётся ручной ввод
      }
      setLoading(false);
      return;
    }

    setStandaloneGate(false);
    await bootstrapWithInitData(resolved);
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
      .get<{
        botName?: string | null;
        botUsername?: string | null;
        companyName?: string | null;
        supportEmail?: string | null;
        supportTelegram?: string | null;
        siteUrl?: string | null;
      }>('/public/meta')
      .then((r) => {
        setAppName(r.data?.botName ?? null);
        setPublicMeta(r.data ?? null);
      })
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

  const submitStandaloneInitData = useCallback(
    async (raw: string) => {
      const v = String(raw ?? '').trim();
      if (!v) return;
      setFatalError(null);
      setStandaloneGate(false);
      setLoading(true);
      try {
        await bootstrapWithInitData(v);
      } catch (e: unknown) {
        logDevError(e);
        setFatalError(getApiErrorMessage(e, 'Не удалось загрузить статус.'));
      } finally {
        setLoading(false);
      }
    },
    [bootstrapWithInitData],
  );

  const restartBrowserLogin = useCallback(async () => {
    try {
      const s = await startMiniBrowserLogin();
      setBrowserLogin({ loginId: s.loginId, expiresAt: s.expiresAt, deepLink: s.deepLink, status: 'PENDING' });
    } catch (e: unknown) {
      showErrorToast(e, 'Не удалось получить код');
    }
  }, [showErrorToast]);

  // Poll browser login status
  useEffect(() => {
    if (!standaloneGate) return;
    if (!browserLogin?.loginId) return;
    if (browserLogin.status !== 'PENDING') return;

    let cancelled = false;
    const t = setInterval(async () => {
      try {
        const res = await getMiniBrowserLoginStatus(browserLogin.loginId);
        if (cancelled) return;
        if (res.status === 'EXPIRED') {
          setBrowserLogin((prev) => (prev ? { ...prev, status: 'EXPIRED' } : prev));
          return;
        }
        if (res.status === 'APPROVED' && 'initData' in res) {
          clearInterval(t);
          await submitStandaloneInitData(res.initData);
        }
      } catch {
        // ignore: временные сетевые ошибки
      }
    }, 1500);

    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [standaloneGate, browserLogin?.loginId, browserLogin?.status, submitStandaloneInitData]);

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
    async (variantId: string, provider: 'TELEGRAM_STARS' | 'PLATEGA', payingKey: string) => {
      if (!initData) {
        setToast({ type: 'error', message: 'Сессия истекла. Закройте и откройте приложение снова.' });
        return;
      }
      setToast(null);
      setPayingPlanKey(payingKey);
      try {
        const res = await payMiniPlanWithProvider(initData, variantId, provider);

        if ('invoiceLink' in res && res.invoiceLink) {
          if (!tg?.openInvoice) {
            setToast({ type: 'error', message: 'Оплата доступна только внутри Telegram.' });
            return;
          }

          const status = await new Promise<'paid' | 'cancelled' | 'failed'>((resolve) => {
            tg.openInvoice?.(res.invoiceLink, (s) => resolve(s));
          });

          await handleLoadStatusSilent();

          if (status === 'paid') {
            tg?.HapticFeedback?.notificationOccurred?.('success');
            showSuccessToast('Оплата прошла. Подписка продлена.');
          } else if (status === 'cancelled') {
            setToast({ type: 'error', message: 'Оплата отменена.' });
          } else {
            setToast({ type: 'error', message: 'Не удалось выполнить оплату.' });
          }
          return;
        }

        if ('paymentUrl' in res && res.paymentUrl) {
          if (tg?.openLink) tg.openLink(res.paymentUrl);
          else window.open(res.paymentUrl, '_blank', 'noopener,noreferrer');
          setToast({ type: 'success', message: 'Открываем страницу оплаты…' });
          return;
        }

        await handleLoadStatusSilent();
        tg?.HapticFeedback?.notificationOccurred?.('success');
        showSuccessToast('Оплата прошла. Подписка продлена.');
      } catch (e: unknown) {
        showErrorToast(e, 'Не удалось выполнить оплату.');
      } finally {
        setPayingPlanKey(null);
      }
    },
    [initData, handleLoadStatusSilent, showErrorToast, showSuccessToast, tg],
  );

  const openPaymentMethodsForGroup = useCallback((groupKey: string) => {
    setSelectedPlanGroupKey(groupKey);
    setPaymentSheetOpen(true);
  }, []);

  const closePaymentSheet = useCallback(() => setPaymentSheetOpen(false), []);

  const choosePaymentMethod = useCallback(
    async (provider: 'TELEGRAM_STARS' | 'PLATEGA') => {
      if (!selectedPlanGroup) return;

      const variant =
        provider === 'TELEGRAM_STARS'
          ? selectedPlanGroup.variants.find((v) => v.currency === 'XTR')
          : selectedPlanGroup.variants.find((v) => v.currency !== 'XTR');

      if (!variant) {
        setToast({ type: 'error', message: 'Этот способ оплаты недоступен для выбранного тарифа.' });
        return;
      }

      setPaymentSheetOpen(false);
      await handlePay(variant.id, provider, selectedPlanGroup.key);
    },
    [handlePay, selectedPlanGroup],
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

  const goHelp = useCallback(() => setScreen('help' as any), []);

  return {
    // ui state
    appName,
    publicMeta,
    loading,
    fatalError,
    standaloneGate,
    browserLogin,
    toast,
    screen,
    screenEntered,

    // data
    status,
    servers,
    plans,
    planGroups,
    configUrl,
    configCopied,
    payingPlanKey,
    activatingServerId,
    refreshingServers,
    hasActiveServer,
    activeServerId,
    paymentSheetOpen,
    selectedPlanGroup,

    // actions
    goHome,
    goHelp,
    setScreen,
    handleLoadConfig,
    handleLoadPlans,
    handleRefreshServers,
    handleActivateServer,
    handlePay,
    handleCopyConfig,
    openPaymentMethodsForGroup,
    closePaymentSheet,
    choosePaymentMethod,
    submitStandaloneInitData,
    restartBrowserLogin,
  };
}


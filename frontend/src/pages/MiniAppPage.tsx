import { useTelegramBackButton, useTelegramWebAppUi } from '../hooks/useTelegramWebAppUi';
import { MiniAppToast } from '../components/MiniAppToast';
import { MiniAppHome } from '../components/MiniAppHome';
import { MiniAppConfig } from '../components/MiniAppConfig';
import { MiniAppPlans } from '../components/MiniAppPlans';
import { MiniAppLoading } from '../components/MiniAppLoading';
import { MiniAppFatalError } from '../components/MiniAppFatalError';
import { MiniAppHeader } from '../components/MiniAppHeader';
import { MiniAppFooter } from '../components/MiniAppFooter';
import { useMiniAppController } from '../hooks/useMiniAppController';
import { MiniAppPaymentMethodSheet } from '../components/MiniAppPaymentMethodSheet';
import { MiniAppBrowserLoginGate } from '../components/MiniAppBrowserLoginGate';
import { MiniAppHelp } from '../components/MiniAppHelp';

const FALLBACK_APP_TITLE = 'VPN';

/** Класс для тактильного отклика кнопок (scale при нажатии) */
const BTN_TAP = 'transition-transform duration-150 active:scale-[0.98]';

export function MiniAppPage() {
  const { tg, theme, containerSafeStyle, viewportHeight } = useTelegramWebAppUi();
  const controller = useMiniAppController({ tg });
  useTelegramBackButton({ tg, visible: controller.screen !== 'home', onClick: controller.goHome });

  if (controller.loading) {
    return <MiniAppLoading theme={theme} lang={controller.lang} m={controller.m} />;
  }

  if (controller.fatalError) {
    const canClose = Boolean(tg?.close);
    return (
      <MiniAppFatalError
        theme={theme}
        lang={controller.lang}
        m={controller.m}
        title={controller.appName || FALLBACK_APP_TITLE}
        message={controller.fatalError}
        onRetry={() => window.location.reload()}
        onClose={canClose ? () => tg?.close?.() : undefined}
      />
    );
  }

  if (controller.standaloneGate) {
    const b = controller.browserLogin;
    if (!b) {
      // fallback (если не удалось получить код)
      return (
        <MiniAppBrowserLoginGate
          theme={theme}
          lang={controller.lang}
          m={controller.m}
          title={controller.appName || FALLBACK_APP_TITLE}
          expiresAt={new Date(Date.now() + 5 * 60_000).toISOString()}
          status="EXPIRED"
          deepLink={null}
          onRestart={controller.restartBrowserLogin}
          onSubmitInitData={controller.submitStandaloneInitData}
        />
      );
    }
    return (
      <MiniAppBrowserLoginGate
        theme={theme}
        lang={controller.lang}
        m={controller.m}
        title={controller.appName || FALLBACK_APP_TITLE}
        expiresAt={b.expiresAt}
        status={b.status}
        deepLink={b.deepLink}
        onRestart={controller.restartBrowserLogin}
        onSubmitInitData={controller.submitStandaloneInitData}
      />
    );
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
      <MiniAppHeader theme={theme} lang={controller.lang} m={controller.m} title={controller.status?.botName || controller.appName || FALLBACK_APP_TITLE} />

      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
        <div
          className={`max-w-md mx-auto w-full py-6 mt-auto mb-auto ${controller.screen === 'home' ? 'space-y-5' : 'space-y-8'}`}
          style={{
            opacity: controller.screenEntered ? 1 : 0,
            transition: 'opacity 0.2s ease-out',
          }}
        >
        <MiniAppToast toast={controller.toast} theme={theme} />

        {/* HOME */}
        {controller.screen === 'home' && controller.status && (
          <MiniAppHome
            theme={theme}
            btnTapClass={BTN_TAP}
            lang={controller.lang}
            m={controller.m}
            status={controller.status}
            servers={controller.servers}
            refreshingServers={controller.refreshingServers}
            activatingServerId={controller.activatingServerId}
            hasActiveServer={controller.hasActiveServer}
            activeServerId={controller.activeServerId}
            onRefreshServers={controller.handleRefreshServers}
            onActivateServer={controller.handleActivateServer}
            onOpenConfig={controller.handleLoadConfig}
            onOpenPlans={controller.handleLoadPlans}
          />
        )}

        {/* Список локаций теперь показывается на home (без отдельного экрана и подтверждения) */}

        {/* CONFIG */}
        {controller.screen === 'config' && (
          <MiniAppConfig
            theme={theme}
            btnTapClass={BTN_TAP}
            lang={controller.lang}
            m={controller.m}
            configUrl={controller.configUrl}
            configCopied={controller.configCopied}
            onCopy={controller.handleCopyConfig}
            onBack={controller.goHome}
          />
        )}

        {/* PLANS */}
        {controller.screen === 'plans' && (
          <MiniAppPlans
            theme={theme}
            btnTapClass={BTN_TAP}
            lang={controller.lang}
            m={controller.m}
            planGroups={controller.planGroups}
            payingPlanKey={controller.payingPlanKey}
            onRefresh={controller.handleLoadPlans}
            onBack={controller.goHome}
            onSelectPlan={controller.openPaymentMethodsForGroup}
          />
        )}

        {/* HELP */}
        {controller.screen === 'help' && (
          <MiniAppHelp theme={theme} btnTapClass={BTN_TAP} lang={controller.lang} m={controller.m} meta={controller.publicMeta} onBack={controller.goHome} />
        )}
        </div>
      </div>

      <MiniAppFooter theme={theme} lang={controller.lang} m={controller.m} onHelp={controller.goHelp} />

      <MiniAppPaymentMethodSheet
        theme={theme}
        btnTapClass={BTN_TAP}
        open={controller.paymentSheetOpen}
        title={
          controller.selectedPlanGroup
            ? `${controller.m.paymentSheet.titlePayPrefix} ${controller.selectedPlanGroup.name}`
            : controller.m.paymentSheet.titleChoose
        }
        m={controller.m}
        options={[
          {
            id: 'TELEGRAM_STARS',
            title: controller.m.paymentSheet.starsTitle,
            subtitle: controller.m.paymentSheet.starsSubtitle,
            badge: 'XTR',
          },
          {
            id: 'PLATEGA',
            title: controller.m.paymentSheet.cardTitle,
            subtitle: controller.m.paymentSheet.cardSubtitle,
            badge: 'RUB',
          },
        ]}
        onClose={controller.closePaymentSheet}
        onSelect={controller.choosePaymentMethod}
      />
    </div>
  );
}


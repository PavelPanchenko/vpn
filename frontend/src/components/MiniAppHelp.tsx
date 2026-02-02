import type { TelegramTheme } from '../hooks/useTelegramWebAppUi';

function normalizeTgHandle(s: string): { label: string; url: string } {
  const raw = s.trim();
  const handle = raw.replace(/^@/, '');
  return { label: raw.startsWith('@') ? raw : `@${handle}`, url: `https://t.me/${handle}` };
}

export function MiniAppHelp(props: {
  theme: TelegramTheme;
  btnTapClass: string;
  meta: {
    companyName?: string | null;
    supportEmail?: string | null;
    supportTelegram?: string | null;
    botUsername?: string | null;
    siteUrl?: string | null;
  } | null;
  onBack: () => void;
}) {
  const { theme, btnTapClass, meta, onBack } = props;

  const tg = meta?.supportTelegram ? normalizeTgHandle(meta.supportTelegram) : null;
  const mail = meta?.supportEmail ? `mailto:${meta.supportEmail}` : null;

  return (
    <section
      className="rounded-2xl border p-4 space-y-4"
      style={{ borderColor: 'rgba(255,255,255,0.12)', background: theme.secondaryBg }}
    >
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">Помощь</div>
        <button onClick={onBack} className={`text-xs ${btnTapClass}`} style={{ color: theme.link }}>
          Назад
        </button>
      </div>

      <div className="rounded-xl border p-4 space-y-2" style={{ borderColor: 'rgba(255,255,255,0.10)' }}>
        <div className="text-sm font-semibold">Как пользоваться ключом</div>
        <ol className="text-sm space-y-1" style={{ color: theme.hint }}>
          <li>1) Выберите локацию на главном экране.</li>
          <li>2) Откройте «Конфигурация» и скопируйте ключ/ссылку или отсканируйте QR.</li>
          <li>3) Импортируйте в приложение VPN и включите подключение.</li>
        </ol>
        <div className="text-xs mt-2" style={{ color: theme.hint }}>
          Поддерживаемые клиенты (пример): iOS — Shadowrocket, Android — v2rayNG, Windows — v2rayN, macOS — ClashX.
        </div>
      </div>

      <div className="rounded-xl border p-4 space-y-2" style={{ borderColor: 'rgba(255,255,255,0.10)' }}>
        <div className="text-sm font-semibold">Контакты</div>
        <div className="text-sm" style={{ color: theme.hint }}>
          {meta?.companyName ? <div>Сервис: <span style={{ color: theme.text }}>{meta.companyName}</span></div> : null}
          {tg ? (
            <div>
              Telegram:{' '}
              <a href={tg.url} target="_blank" rel="noreferrer" style={{ color: theme.link }}>
                {tg.label}
              </a>
            </div>
          ) : null}
          {meta?.supportEmail ? (
            <div>
              Email:{' '}
              <a href={mail ?? '#'} style={{ color: theme.link }}>
                {meta.supportEmail}
              </a>
            </div>
          ) : null}
          {meta?.siteUrl ? (
            <div>
              Сайт:{' '}
              <a href={meta.siteUrl} target="_blank" rel="noreferrer" style={{ color: theme.link }}>
                {meta.siteUrl}
              </a>
            </div>
          ) : null}
          {!tg && !meta?.supportEmail ? <div>Контакты не настроены</div> : null}
        </div>
      </div>

      {meta?.botUsername ? (
        <div className="text-xs" style={{ color: theme.hint }}>
          Бот: <span className="font-mono" style={{ color: theme.text }}>@{meta.botUsername}</span>
        </div>
      ) : null}
    </section>
  );
}


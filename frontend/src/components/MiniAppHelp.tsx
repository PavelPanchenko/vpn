import type { TelegramTheme } from '../hooks/useTelegramWebAppUi';
import type { MiniLang } from '../lib/miniLang';
import type { mm } from '../lib/miniMessages';

function normalizeTgHandle(s: string): { label: string; url: string } {
  const raw = s.trim();
  const handle = raw.replace(/^@/, '');
  return { label: raw.startsWith('@') ? raw : `@${handle}`, url: `https://t.me/${handle}` };
}

const V2RAYTUN_URL = 'https://v2raytun.com/';

export function MiniAppHelp(props: {
  theme: TelegramTheme;
  btnTapClass: string;
  lang: MiniLang;
  m: ReturnType<typeof mm>;
  meta: {
    companyName?: string | null;
    supportEmail?: string | null;
    supportTelegram?: string | null;
    botUsername?: string | null;
    siteUrl?: string | null;
  } | null;
  onBack: () => void;
}) {
  const { theme, btnTapClass, m, meta, onBack } = props;

  const tg = meta?.supportTelegram ? normalizeTgHandle(meta.supportTelegram) : null;
  const mail = meta?.supportEmail ? `mailto:${meta.supportEmail}` : null;

  return (
    <section
      className="rounded-2xl border p-4 space-y-4"
      style={{ borderColor: 'rgba(255,255,255,0.12)', background: theme.secondaryBg }}
    >
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">{m.help.title}</div>
        <button onClick={onBack} className={`text-xs ${btnTapClass}`} style={{ color: theme.link }}>
          {m.common.back}
        </button>
      </div>

      <div className="rounded-xl border p-4 space-y-2" style={{ borderColor: 'rgba(255,255,255,0.10)' }}>
        <div className="text-sm font-semibold">{m.help.howToUseKey}</div>
        <ol className="text-sm space-y-1" style={{ color: theme.hint }}>
          <li>{m.help.step1}</li>
          <li>{m.help.step2}</li>
          <li>{m.help.step3}</li>
        </ol>
        <div className="text-xs mt-2" style={{ color: theme.hint }}>
          {m.help.clientsHint}
        </div>
        <div className="text-xs mt-2" style={{ color: theme.hint }}>
          {m.help.v2rayTunGuide}{' '}
          <a href={V2RAYTUN_URL} target="_blank" rel="noreferrer" style={{ color: theme.link }}>
            {V2RAYTUN_URL}
          </a>
        </div>
      </div>

      <div className="rounded-xl border p-4 space-y-2" style={{ borderColor: 'rgba(255,255,255,0.10)' }}>
        <div className="text-sm font-semibold">{m.help.contacts}</div>
        <div className="text-sm" style={{ color: theme.hint }}>
          {meta?.companyName ? (
            <div>
              {m.help.service}:{' '}
              <span style={{ color: theme.text }}>{meta.companyName}</span>
            </div>
          ) : null}
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
              {m.help.site}:{' '}
              <a href={meta.siteUrl} target="_blank" rel="noreferrer" style={{ color: theme.link }}>
                {meta.siteUrl}
              </a>
            </div>
          ) : null}
          {!tg && !meta?.supportEmail ? <div>{m.help.contactsNotConfigured}</div> : null}
        </div>
      </div>

      {meta?.botUsername ? (
        <div className="text-xs" style={{ color: theme.hint }}>
          {m.help.bot}:{' '}
          <span className="font-mono" style={{ color: theme.text }}>
            @{meta.botUsername}
          </span>
        </div>
      ) : null}
    </section>
  );
}


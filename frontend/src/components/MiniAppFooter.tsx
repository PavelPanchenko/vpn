import type { TelegramTheme } from '../hooks/useTelegramWebAppUi';
import type { MiniLang } from '../lib/miniLang';
import type { mm } from '../lib/miniMessages';

export function MiniAppFooter(props: { theme: TelegramTheme; lang: MiniLang; m: ReturnType<typeof mm>; onHelp: () => void }) {
  const { theme, m, onHelp } = props;
  return (
    <footer
      className="shrink-0 pt-5 pb-5 text-center text-xs border-t"
      style={{ color: theme.hint, borderColor: 'rgba(255,255,255,0.08)' }}
    >
      <a href="/privacy" style={{ color: theme.link }} target="_blank" rel="noreferrer">
        {m.footer.privacy}
      </a>
      <span className="px-2">·</span>
      <a href="/terms" style={{ color: theme.link }} target="_blank" rel="noreferrer">
        {m.footer.terms}
      </a>
      <span className="px-2">·</span>
      <button type="button" onClick={onHelp} style={{ color: theme.link }}>
        {m.footer.help}
      </button>
    </footer>
  );
}


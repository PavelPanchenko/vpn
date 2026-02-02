import type { TelegramTheme } from '../hooks/useTelegramWebAppUi';

export function MiniAppFooter(props: { theme: TelegramTheme; onHelp: () => void }) {
  const { theme, onHelp } = props;
  return (
    <footer
      className="shrink-0 pt-5 pb-5 text-center text-xs border-t"
      style={{ color: theme.hint, borderColor: 'rgba(255,255,255,0.08)' }}
    >
      <a href="/privacy" style={{ color: theme.link }} target="_blank" rel="noreferrer">
        Политика конфиденциальности
      </a>
      <span className="px-2">·</span>
      <a href="/terms" style={{ color: theme.link }} target="_blank" rel="noreferrer">
        Пользовательское соглашение
      </a>
      <span className="px-2">·</span>
      <button type="button" onClick={onHelp} style={{ color: theme.link }}>
        Помощь
      </button>
    </footer>
  );
}


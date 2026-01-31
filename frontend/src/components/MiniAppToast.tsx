import type { TelegramTheme } from '../hooks/useTelegramWebAppUi';

export type MiniToastState = { type: 'error' | 'success'; message: string } | null;

export function MiniAppToast(props: { toast: MiniToastState; theme: TelegramTheme }) {
  const { toast, theme } = props;
  if (!toast) return null;

  return (
    <div
      className="rounded-2xl border px-4 py-3 text-sm whitespace-pre-wrap"
      style={{
        borderColor: toast.type === 'error' ? theme.destructive : theme.link,
        color: toast.type === 'error' ? theme.destructive : theme.link,
        background: theme.secondaryBg,
      }}
    >
      {toast.type === 'success' ? '✓ ' : ''}
      {toast.message}
    </div>
  );
}


import { useEffect, useMemo, useState } from 'react';
import type { TelegramWebApp } from '../lib/telegramWebAppTypes';

export type TelegramTheme = {
  bg: string;
  secondaryBg: string;
  text: string;
  hint: string;
  link: string;
  button: string;
  buttonText: string;
  destructive: string;
};

export type SafeAreaInsets = { top: number; bottom: number; left: number; right: number };

function getTelegramTheme(tg: TelegramWebApp | undefined, themeVersion: number): TelegramTheme {
  void themeVersion; // используется для принудительного пересчёта при themeChanged
  const tp = tg?.themeParams || {};
  const get = (snake: string, camel: string) => (tp as any)[snake] ?? (tp as any)[camel];
  return {
    bg: get('bg_color', 'bgColor') ?? '#0b1220',
    secondaryBg: get('secondary_bg_color', 'secondaryBgColor') ?? '#0f172a',
    text: get('text_color', 'textColor') ?? '#ffffff',
    hint: get('hint_color', 'hintColor') ?? '#94a3b8',
    link: get('link_color', 'linkColor') ?? '#60a5fa',
    button: get('button_color', 'buttonColor') ?? '#6366f1',
    buttonText: get('button_text_color', 'buttonTextColor') ?? '#ffffff',
    destructive: get('destructive_text_color', 'destructiveTextColor') ?? '#ef4444',
  };
}

/**
 * UI-обвязка Telegram WebApp:
 * - theme + live updates
 * - safeArea insets + live updates
 * - viewportChanged (чтобы компонент перерисовался и обновил minHeight)
 * - setHeaderColor/setBackgroundColor под текущую тему
 */
export function useTelegramWebAppUi() {
  const tg: TelegramWebApp | undefined =
    typeof window !== 'undefined' ? ((window as any).Telegram?.WebApp as TelegramWebApp | undefined) : undefined;

  const [themeVersion, setThemeVersion] = useState(0);
  const [viewportVersion, setViewportVersion] = useState(0);
  const [safeArea, setSafeArea] = useState<SafeAreaInsets | null>(null);

  const theme = useMemo(() => getTelegramTheme(tg, themeVersion), [tg?.themeParams, themeVersion]);

  // Safe area: contentSafeAreaInset (Bot API 8.0+) — область без перекрытия UI Telegram; иначе safeAreaInset
  useEffect(() => {
    const w: TelegramWebApp | undefined =
      typeof window !== 'undefined' ? ((window as any).Telegram?.WebApp as TelegramWebApp | undefined) : undefined;
    if (!w) return;
    const content = w.contentSafeAreaInset;
    const device = w.safeAreaInset;
    const ins = content ?? device;
    if (ins && typeof ins.top === 'number') {
      setSafeArea({
        top: ins.top ?? 0,
        bottom: ins.bottom ?? 0,
        left: ins.left ?? 0,
        right: ins.right ?? 0,
      });
    }
    const onSafe = () => {
      const c = (window as any).Telegram?.WebApp?.contentSafeAreaInset;
      const d = (window as any).Telegram?.WebApp?.safeAreaInset;
      const i = c ?? d;
      if (i && typeof i.top === 'number') {
        setSafeArea({ top: i.top ?? 0, bottom: i.bottom ?? 0, left: i.left ?? 0, right: i.right ?? 0 });
      }
    };
    try {
      w.onEvent?.('safeAreaChanged', onSafe);
      w.onEvent?.('contentSafeAreaChanged', onSafe);
    } catch {
      // ignore
    }
    return () => {
      try {
        w.offEvent?.('safeAreaChanged', onSafe);
        w.offEvent?.('contentSafeAreaChanged', onSafe);
      } catch {
        // ignore
      }
    };
  }, []);

  // Тема в реальном времени (themeChanged)
  useEffect(() => {
    const w: TelegramWebApp | undefined =
      typeof window !== 'undefined' ? ((window as any).Telegram?.WebApp as TelegramWebApp | undefined) : undefined;
    if (!w) return;
    const onTheme = () => setThemeVersion((v) => v + 1);
    try {
      w.onEvent?.('themeChanged', onTheme);
    } catch {
      // ignore
    }
    return () => {
      try {
        w.offEvent?.('themeChanged', onTheme);
      } catch {
        // ignore
      }
    };
  }, []);

  // Viewport (Telegram WebApp API): корректная высота внутри Telegram
  useEffect(() => {
    const w: TelegramWebApp | undefined =
      typeof window !== 'undefined' ? ((window as any).Telegram?.WebApp as TelegramWebApp | undefined) : undefined;
    if (!w) return;
    const onViewport = () => setViewportVersion((v) => v + 1);
    try {
      w.onEvent?.('viewportChanged', onViewport);
    } catch {
      // ignore
    }
    return () => {
      try {
        w.offEvent?.('viewportChanged', onViewport);
      } catch {
        // ignore
      }
    };
  }, []);

  useEffect(() => {
    const w: TelegramWebApp | undefined =
      typeof window !== 'undefined' ? ((window as any).Telegram?.WebApp as TelegramWebApp | undefined) : undefined;
    if (!w || !theme.bg) return;
    try {
      w.setHeaderColor?.(theme.bg);
      w.setBackgroundColor?.(theme.bg);
    } catch {
      // ignore
    }
  }, [theme.bg]);

  // Отступы по документации: content safe area / device safe area; fallback — env() + минимум
  const containerSafeStyle = useMemo(() => {
    if (safeArea) {
      const extraTop = 16;
      return {
        paddingTop: safeArea.top + extraTop,
        paddingBottom: safeArea.bottom + 24,
        paddingLeft: safeArea.left + 16,
        paddingRight: safeArea.right + 16,
      } as const;
    }
    return {
      paddingTop: 'max(48px, calc(env(safe-area-inset-top, 0px) + 28px))',
      paddingBottom: 24,
      paddingLeft: 16,
      paddingRight: 16,
    } as const;
  }, [safeArea]);

  const viewportHeight = useMemo(() => {
    void viewportVersion; // форсим пересчёт при viewportChanged
    if (typeof tg?.viewportStableHeight === 'number') return `${tg.viewportStableHeight}px`;
    if (typeof tg?.viewportHeight === 'number') return `${tg.viewportHeight}px`;
    return undefined;
  }, [tg, viewportVersion]);

  return { tg, theme, safeArea, containerSafeStyle, viewportHeight };
}

export function useTelegramBackButton(args: {
  tg: TelegramWebApp | undefined;
  visible: boolean;
  onClick: () => void;
}) {
  useEffect(() => {
    const back = args.tg?.BackButton;
    if (!back) return;

    try {
      if (args.visible) back.show?.();
      else back.hide?.();
    } catch {
      // ignore
    }

    const handler = () => args.onClick();

    try {
      back.onClick?.(handler);
    } catch {
      // ignore
    }

    return () => {
      try {
        back.offClick?.(handler);
      } catch {
        // ignore
      }
    };
  }, [args.tg, args.visible, args.onClick]);
}


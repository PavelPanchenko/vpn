export type TelegramWebAppBackButton = {
  show?: () => void;
  hide?: () => void;
  onClick?: (cb: () => void) => void;
  offClick?: (cb: () => void) => void;
};

export type TelegramWebAppHapticFeedback = {
  notificationOccurred?: (type: 'success' | 'warning' | 'error') => void;
};

export type TelegramWebAppSafeAreaInsets = {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
};

export type TelegramWebAppThemeParams = Record<string, unknown>;

export type TelegramWebApp = {
  initData?: string;
  themeParams?: TelegramWebAppThemeParams;
  viewportHeight?: number;
  viewportStableHeight?: number;
  safeAreaInset?: TelegramWebAppSafeAreaInsets;
  contentSafeAreaInset?: TelegramWebAppSafeAreaInsets;

  BackButton?: TelegramWebAppBackButton;
  HapticFeedback?: TelegramWebAppHapticFeedback;

  ready?: () => void;
  expand?: () => void;
  close?: () => void;

  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;

  onEvent?: (event: string, cb: () => void) => void;
  offEvent?: (event: string, cb: () => void) => void;
};


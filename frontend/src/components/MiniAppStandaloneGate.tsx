import { useMemo, useState } from 'react';
import type { TelegramTheme } from '../hooks/useTelegramWebAppUi';
import type { MiniLang } from '../lib/miniLang';
import type { mm } from '../lib/miniMessages';

export function MiniAppStandaloneGate(props: {
  theme: TelegramTheme;
  lang: MiniLang;
  m: ReturnType<typeof mm>;
  title: string;
  initialInitData?: string;
  onSubmit: (initData: string) => void;
}) {
  const { theme, m, title, initialInitData, onSubmit } = props;
  const [value, setValue] = useState(initialInitData ?? '');

  const canSubmit = useMemo(() => value.trim().length > 0, [value]);

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{
        background: theme.bg,
        color: theme.text,
        paddingTop: 'max(48px, calc(env(safe-area-inset-top, 0px) + 28px))',
      }}
    >
      <div className="w-full max-w-md">
        <div
          className="rounded-2xl border p-5"
          style={{
            borderColor: 'rgba(255,255,255,0.12)',
            background: theme.secondaryBg,
            boxShadow: '0 0 0 1px rgba(255,255,255,0.06), 0 6px 18px rgba(0,0,0,0.22)',
          }}
        >
          <div className="text-lg font-semibold">{title}</div>
          <div className="text-sm mt-1" style={{ color: theme.hint }}>
            {m.standalone.intro}
          </div>

          <div className="mt-4 rounded-xl border px-3 py-3 text-sm" style={{ borderColor: 'rgba(255,255,255,0.10)' }}>
            <div className="text-xs mb-2" style={{ color: theme.hint }}>
              {m.standalone.initDataLabel}
            </div>
            <textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              rows={4}
              className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none"
              style={{
                borderColor: 'rgba(255,255,255,0.14)',
                color: theme.text,
              }}
              placeholder={m.standalone.initDataPlaceholder}
            />
            <div className="mt-2 text-xs" style={{ color: theme.hint }}>
              {m.standalone.hint}
            </div>
          </div>

          <div className="mt-5 flex gap-3">
            <button
              onClick={() => onSubmit(value)}
              disabled={!canSubmit}
              className="flex-1 inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-medium disabled:opacity-50"
              style={{ background: theme.button, color: theme.buttonText }}
            >
              {m.common.continue}
            </button>
            <button
              onClick={() => setValue('')}
              className="inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-medium border"
              style={{ borderColor: 'rgba(255,255,255,0.14)', color: theme.text }}
            >
              {m.common.clear}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


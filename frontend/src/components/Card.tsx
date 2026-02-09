import { useState, type ReactNode } from 'react';

export function Card({
  title,
  children,
  right,
  collapsible = false,
  defaultOpen = true,
}: {
  title?: string;
  children: ReactNode;
  right?: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  const isCollapsible = collapsible && !!title;

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      {title && (
        <div
          className={`flex items-center justify-between border-b border-slate-100 px-3 py-3 sm:px-4 ${
            isCollapsible ? 'cursor-pointer select-none' : ''
          } ${!open ? 'border-b-0' : ''}`}
          onClick={isCollapsible ? () => setOpen((v) => !v) : undefined}
        >
          <div className="flex items-center gap-2">
            {isCollapsible && (
              <svg
                className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            )}
            <div className="text-sm font-semibold text-slate-900">{title}</div>
          </div>
          {right && <div onClick={(e) => e.stopPropagation()}>{right}</div>}
        </div>
      )}
      {!title && right && (
        <div className="flex items-center justify-end border-b border-slate-100 px-3 py-3 sm:px-4">
          {right}
        </div>
      )}
      {open && <div className="p-3 sm:p-4">{children}</div>}
    </div>
  );
}

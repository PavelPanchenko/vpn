import { type ReactNode, useEffect } from 'react';

export function Modal({
  open,
  title,
  children,
  footer,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px]" onClick={onClose} />
      <div className="absolute inset-0 overflow-y-auto">
        <div className="mx-auto flex min-h-full max-w-2xl items-center justify-center p-4">
          <div className="w-full rounded-2xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div className="text-sm font-semibold text-slate-900">{title}</div>
              <button
                className="rounded-lg px-2 py-1 text-sm text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                onClick={onClose}
                type="button"
              >
                Close
              </button>
            </div>
            <div className="px-5 py-4">{children}</div>
            {footer ? <div className="border-t border-slate-100 px-5 py-4">{footer}</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}


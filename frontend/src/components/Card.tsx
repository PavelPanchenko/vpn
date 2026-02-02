import { type ReactNode } from 'react';

export function Card({ title, children, right }: { title?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      {title && (
        <div className="flex items-center justify-between border-b border-slate-100 px-3 py-3 sm:px-4">
          <div className="text-sm font-semibold text-slate-900">{title}</div>
          {right}
        </div>
      )}
      {!title && right && (
        <div className="flex items-center justify-end border-b border-slate-100 px-3 py-3 sm:px-4">
          {right}
        </div>
      )}
      <div className="p-3 sm:p-4">{children}</div>
    </div>
  );
}


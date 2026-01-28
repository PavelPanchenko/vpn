import { type ReactNode } from 'react';

export function Table({
  columns,
  children,
}: {
  columns: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
          {columns}
        </thead>
        <tbody className="text-slate-800">{children}</tbody>
      </table>
    </div>
  );
}

export function Th({ children, className }: { children: ReactNode; className?: string }) {
  return <th className={['px-4 py-3', className].filter(Boolean).join(' ')}>{children}</th>;
}

export function Td({ children, className, colSpan }: { children: ReactNode; className?: string; colSpan?: number }) {
  return <td className={['px-4 py-3', className].filter(Boolean).join(' ')} colSpan={colSpan}>{children}</td>;
}


type Variant = 'default' | 'success' | 'warning' | 'danger' | 'info';

export function Badge({ children, variant = 'default' }: { children: string; variant?: Variant }) {
  const base =
    'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium leading-5';
  const variants: Record<Variant, string> = {
    default: 'border-slate-200 bg-slate-50 text-slate-700',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    warning: 'border-amber-200 bg-amber-50 text-amber-800',
    danger: 'border-red-200 bg-red-50 text-red-700',
    info: 'border-sky-200 bg-sky-50 text-sky-700',
  };
  return <span className={[base, variants[variant]].join(' ')}>{children}</span>;
}

export function statusBadgeVariant(value: string): Variant {
  switch (value) {
    case 'ACTIVE':
    case 'PAID':
      return 'success';
    case 'BLOCKED':
      return 'danger';
    case 'EXPIRED':
    case 'FAILED':
      return 'warning';
    default:
      return 'default';
  }
}


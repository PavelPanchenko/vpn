import { type ButtonHTMLAttributes } from 'react';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger';
};

export function Button({ className, variant = 'primary', ...props }: Props) {
  const base =
    'inline-flex h-9 items-center justify-center rounded-lg px-3 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50';
  const variants: Record<NonNullable<Props['variant']>, string> = {
    primary: 'bg-slate-900 text-white hover:bg-slate-800 focus:ring-slate-900 shadow-sm',
    secondary:
      'bg-white text-slate-900 border border-slate-200 hover:bg-slate-50 focus:ring-slate-300 shadow-sm',
    danger: 'bg-red-600 text-white hover:bg-red-500 focus:ring-red-600 shadow-sm',
  };

  return <button className={[base, variants[variant], className].filter(Boolean).join(' ')} {...props} />;
}


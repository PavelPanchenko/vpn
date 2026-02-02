import { type ButtonHTMLAttributes } from 'react';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
};

export function Button({ className, variant = 'primary', size = 'md', ...props }: Props) {
  const base =
    'inline-flex items-center justify-center rounded-lg text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50';
  const variants: Record<NonNullable<Props['variant']>, string> = {
    primary: 'bg-slate-900 text-white hover:bg-slate-800 focus:ring-slate-900 shadow-sm',
    secondary:
      'bg-white text-slate-900 border border-slate-200 hover:bg-slate-50 focus:ring-slate-300 shadow-sm',
    danger: 'bg-red-600 text-white hover:bg-red-500 focus:ring-red-600 shadow-sm',
  };
  const sizes: Record<NonNullable<Props['size']>, string> = {
    // mobile touch target ~= 36px+
    sm: 'h-9 px-3 text-xs',
    // default: comfortable on mobile, ok on desktop
    md: 'h-10 px-3',
    lg: 'h-11 px-4 text-base',
  };

  return <button className={[base, variants[variant], sizes[size], className].filter(Boolean).join(' ')} {...props} />;
}


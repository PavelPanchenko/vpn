import { Pencil, Plus, Trash2 } from 'lucide-react';
import { type ButtonHTMLAttributes } from 'react';

const iconMap = {
  edit: Pencil,
  delete: Trash2,
  add: Plus,
} as const;

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: keyof typeof iconMap;
  variant?: 'primary' | 'secondary' | 'danger';
  title: string;
};

export function IconButton({ className, icon, variant = 'secondary', title, ...props }: Props) {
  const base =
    'inline-flex items-center justify-center rounded-lg transition focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 h-9 w-9 shrink-0';
  const variants: Record<NonNullable<Props['variant']>, string> = {
    primary: 'bg-slate-900 text-white border border-transparent hover:bg-slate-800 focus:ring-slate-900 shadow-sm',
    secondary:
      'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 hover:text-slate-900 focus:ring-slate-300',
    danger: 'bg-red-600 text-white border border-transparent hover:bg-red-500 focus:ring-red-600',
  };
  const Icon = iconMap[icon];

  return (
    <button
      type="button"
      className={[base, variants[variant], className].filter(Boolean).join(' ')}
      title={title}
      aria-label={title}
      {...props}
    >
      <Icon size={16} aria-hidden />
    </button>
  );
}

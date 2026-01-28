import React, { type InputHTMLAttributes } from 'react';

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  hint?: string;
};

export const Input = React.forwardRef<HTMLInputElement, Props>(function Input(
  { label, error, hint, className, ...props },
  ref,
) {
  return (
    <label className="block">
      <div className="text-sm font-medium text-slate-700">{label}</div>
      <input
        ref={ref}
        className={[
          'mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none',
          'placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200',
          error ? 'border-red-300 focus:border-red-400 focus:ring-red-100' : null,
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        {...props}
      />
      {error ? (
        <div className="mt-1 text-xs text-red-600">{error}</div>
      ) : hint ? (
        <div className="mt-1 text-xs text-slate-500">{hint}</div>
      ) : null}
    </label>
  );
});


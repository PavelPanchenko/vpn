import { useState } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE_URL;

function getInitials(name: string): string {
  return (name || '?').charAt(0).toUpperCase();
}

const bgColors = [
  'bg-blue-500',
  'bg-emerald-500',
  'bg-violet-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-cyan-500',
  'bg-indigo-500',
  'bg-teal-500',
];

function pickColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return bgColors[Math.abs(hash) % bgColors.length];
}

type UserAvatarProps = {
  userId: string;
  name: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

const sizeClasses = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-16 w-16 text-xl',
};

export function UserAvatar({ userId, name, size = 'sm', className = '' }: UserAvatarProps) {
  const [failed, setFailed] = useState(false);
  const [showFull, setShowFull] = useState(false);
  const sizeClass = sizeClasses[size];
  const avatarUrl = `${API_BASE}/users/${userId}/avatar`;

  if (failed) {
    return (
      <div
        className={`${sizeClass} inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${pickColor(name)} ${className}`}
        title={name}
      >
        {getInitials(name)}
      </div>
    );
  }

  return (
    <>
      <img
        src={avatarUrl}
        alt={name}
        className={`${sizeClass} shrink-0 cursor-pointer rounded-full object-cover transition-opacity hover:opacity-80 ${className}`}
        onError={() => setFailed(true)}
        onClick={() => setShowFull(true)}
        loading="lazy"
      />
      {showFull && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowFull(false)}
        >
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <img
              src={avatarUrl}
              alt={name}
              className="max-h-[80vh] max-w-[80vw] rounded-2xl shadow-2xl"
            />
            <button
              className="absolute -right-3 -top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-700 shadow-md transition-colors hover:bg-slate-100"
              onClick={() => setShowFull(false)}
              aria-label="Close"
            >
              &times;
            </button>
            <div className="mt-3 text-center text-sm font-medium text-white">{name}</div>
          </div>
        </div>
      )}
    </>
  );
}

import { useId } from 'react';

// Marca do FargusGram: um portal com uma fissura atravessando
export function RiftMark({ size = 28, className = '' }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <defs>
        <linearGradient id={`rg-${id}`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#06b6d4" />
          <stop offset="0.5" stopColor="#8b5cf6" />
          <stop offset="1" stopColor="#d946ef" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="16.5" fill="none" stroke={`url(#rg-${id})`} strokeWidth="4.5" />
      <path
        d="M27.5 4.5 L20 21.5 L28.5 25.5 L20.5 43.5"
        fill="none"
        stroke={`url(#rg-${id})`}
        strokeWidth="4.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Wordmark({ className = '' }) {
  return (
    <span className={`wordmark ${className}`}>
      <RiftMark size={24} />
      <span>fargusgram</span>
    </span>
  );
}

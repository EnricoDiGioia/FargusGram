import { mediaUrl } from '../lib/supabase';

const PALETTE = [
  ['#06b6d4', '#8b5cf6'],
  ['#8b5cf6', '#d946ef'],
  ['#f97316', '#db2777'],
  ['#10b981', '#0891b2'],
  ['#6366f1', '#0ea5e9'],
  ['#eab308', '#f97316'],
  ['#ef4444', '#7c3aed'],
  ['#14b8a6', '#6366f1'],
];

function hash(s = '') {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// ring: 'none' | 'unseen' | 'seen'
export default function Avatar({ character, src, size = 32, ring = 'none', onClick, className = '', alt }) {
  const path = src !== undefined ? src : character?.avatar_path;
  const url = mediaUrl(path);
  const label = (character?.name || character?.handle || '?').trim();
  const initial = label ? label[0].toUpperCase() : '?';
  const [a, b] = PALETTE[hash(character?.handle || label) % PALETTE.length];
  const inner = (
    <span
      className="avatar__img"
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.42), background: url ? undefined : `linear-gradient(135deg, ${a}, ${b})` }}
    >
      {url ? <img src={url} alt={alt ?? (character?.handle ? `Foto de @${character.handle}` : '')} loading="lazy" decoding="async" draggable="false" /> : initial}
    </span>
  );
  const Tag = onClick ? 'button' : 'span';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      className={`avatar avatar--${ring} ${className}`}
      onClick={onClick}
      style={ring !== 'none' ? { padding: size > 60 ? 3 : 2 } : undefined}
      aria-label={onClick && character?.handle ? `Abrir @${character.handle}` : undefined}
    >
      {ring !== 'none' ? <span className="avatar__gap">{inner}</span> : inner}
    </Tag>
  );
}

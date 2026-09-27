import { Link } from 'react-router';

// Transforma @menções, #hashtags e links em toques clicáveis
const TOKEN = /(@[A-Za-z0-9._]{2,30})|(#[\p{L}\p{N}_]+)|(https?:\/\/[^\s]+)/gu;

export default function RichText({ text, className = '' }) {
  if (!text) return null;
  const parts = [];
  let last = 0;
  let key = 0;
  for (const m of text.matchAll(TOKEN)) {
    const start = m.index;
    if (start > last) parts.push(text.slice(last, start));
    const prev = start > 0 ? text[start - 1] : '';
    if ((m[1] || m[2]) && /[\p{L}\p{N}_]/u.test(prev)) {
      // e-mail ou palavra colada (ex.: nome@site.com): não é menção
      parts.push(m[0]);
    } else if (m[1]) {
      let handle = m[1].slice(1);
      let trail = '';
      while (handle.endsWith('.')) {
        handle = handle.slice(0, -1);
        trail += '.';
      }
      parts.push(
        <Link key={key++} to={`/u/${handle.toLowerCase()}`} className="mention" onClick={(e) => e.stopPropagation()}>
          @{handle}
        </Link>
      );
      if (trail) parts.push(trail);
    } else if (m[2]) {
      const tag = m[2].slice(1);
      parts.push(
        <Link key={key++} to={`/tag/${encodeURIComponent(tag.toLowerCase())}`} className="mention" onClick={(e) => e.stopPropagation()}>
          #{tag}
        </Link>
      );
    } else if (m[3]) {
      parts.push(
        <a key={key++} href={m[3]} target="_blank" rel="noopener noreferrer" className="mention" onClick={(e) => e.stopPropagation()}>
          {m[3].replace(/^https?:\/\//, '').slice(0, 40)}
        </a>
      );
    }
    last = start + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <span className={`rich ${className}`}>{parts}</span>;
}

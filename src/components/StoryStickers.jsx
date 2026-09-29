import { useEffect, useRef, useState } from 'react';
import { BarChart3, MessageCircleQuestion, AtSign, MapPin, Clock, Plus, X, Search } from 'lucide-react';
import { Sheet, Spinner } from './ui';
import Avatar from './Avatar';
import * as api from '../lib/api';

// ---------------------------------------------------------------------
// Figurinhas do story: enquete, caixinha de perguntas, menção, local e
// horário. No editor elas são camadas como os textos (dá para mover, girar
// e mudar o tamanho). Não vão desenhadas na foto: ficam guardadas como dados
// (stories.stickers) e o visualizador desenha por cima, para dar para tocar.
// Todas as medidas são em px de um story de 1080 de largura (× k).
// ---------------------------------------------------------------------

export const MAX_STICKERS = 10;
export const STICKER_KINDS = [
  { type: 'poll', label: 'Enquete', Icon: BarChart3 },
  { type: 'question', label: 'Perguntas', Icon: MessageCircleQuestion },
  { type: 'mention', label: 'Menção', Icon: AtSign },
  { type: 'location', label: 'Local', Icon: MapPin },
  { type: 'time', label: 'Horário', Icon: Clock },
];

// campos de cada tipo que vão para o banco (além de id, tipo e posição)
const FIELDS = {
  poll: ['question', 'options'],
  question: ['prompt'],
  mention: ['character_id', 'handle'],
  location: ['name'],
  time: ['hora', 'data', 'style'],
};

const MONTHS = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
export function timeFields(d = new Date()) {
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return { hora: `${hh}:${mm}`, data: `${d.getDate()} ${MONTHS[d.getMonth()]}`, style: 'hora' };
}
export const nextTimeStyle = (s) => (s === 'hora' ? 'data' : s === 'data' ? 'ambos' : 'hora');

let seq = 0;
export function newSticker(layers, type, fields) {
  const n = layers.filter((l) => l.kind === 'sticker').length;
  const z = layers.reduce((m, l) => Math.max(m, l.z || 0), 0) + 1;
  return {
    id: `s${Date.now().toString(36)}${(seq++).toString(36)}`,
    kind: 'sticker',
    type,
    x: 0.5,
    y: type === 'poll' || type === 'question' ? 0.42 + (n % 3) * 0.08 : 0.3 + (n % 5) * 0.09,
    rot: 0,
    scale: 1,
    z,
    ...fields,
  };
}

// camada do editor → o que vai para o banco
export function stickersForDb(layers) {
  return layers
    .filter((l) => l.kind === 'sticker')
    .map((l) => {
      const out = { id: l.id, type: l.type, x: +l.x.toFixed(4), y: +l.y.toFixed(4), rot: +(l.rot || 0).toFixed(4), scale: +(l.scale || 1).toFixed(4), z: l.z || 0 };
      for (const f of FIELDS[l.type] || []) if (l[f] != null) out[f] = l[f];
      return out;
    });
}

const pct = (n, total) => (total ? Math.round((n * 100) / total) : 0);

// Desenho da figurinha. `interactive` só no visualizador (no editor tudo é
// "div", para o toque ir para o gesto de mover).
// state: { polls, mine, answered, is_owner, answers } (story_interactions)
export function StickerFace({ s, k, state, interactive = false, onVote, onAsk, onMention, onRepost }) {
  const px = (v) => `${v * k}px`;
  const Tag = interactive ? 'button' : 'div';
  const btn = (fn) => (interactive ? { type: 'button', onClick: fn } : {});

  if (s.type === 'poll') {
    const opts = s.options || [];
    const counts = state?.polls?.[s.id]?.counts || [0, 0, 0, 0];
    const mine = state?.mine?.[s.id];
    const voted = mine !== undefined && mine !== null;
    const results = !!state && (voted || state.is_owner);
    const total = counts.slice(0, opts.length).reduce((a, b) => a + b, 0);
    return (
      <div className="stk stk-poll" style={{ width: px(720), padding: px(30), borderRadius: px(46), gap: px(18) }}>
        {s.question && (
          <div className="stk-poll__q" style={{ fontSize: px(46), padding: `${px(6)} ${px(10)} ${px(8)}` }}>
            {s.question}
          </div>
        )}
        {opts.map((o, i) => (
          <Tag
            key={i}
            className={`stk-poll__opt ${mine === i ? 'is-mine' : ''} ${results ? 'has-results' : ''}`}
            style={{ height: px(104), borderRadius: px(52), fontSize: px(40), padding: `0 ${px(38)}` }}
            aria-label={results ? `${o}: ${pct(counts[i], total)}%` : `Votar em ${o}`}
            {...(results ? {} : btn(() => onVote?.(s, i)))}
          >
            {results && <span className="stk-poll__fill" style={{ width: `${pct(counts[i], total)}%` }} />}
            <span className="stk-poll__label">{o}</span>
            {results && <span className="stk-poll__pct">{pct(counts[i], total)}%</span>}
          </Tag>
        ))}
        {results && state.is_owner && (
          <div className="stk-poll__total" style={{ fontSize: px(32) }}>
            {total === 1 ? '1 voto' : `${total} votos`}
          </div>
        )}
      </div>
    );
  }

  if (s.type === 'question') {
    const answered = state?.answered?.includes(s.id);
    const n = state?.answers?.filter((a) => a.sticker_id === s.id).length || 0;
    const label = state?.is_owner ? (n === 1 ? 'Ver 1 resposta' : `Ver ${n} respostas`) : answered ? 'Resposta enviada ✓' : 'Toque para responder';
    return (
      <div className="stk stk-q" style={{ width: px(700), borderRadius: px(46) }}>
        <div className="stk-q__head" style={{ padding: `${px(40)} ${px(40)} ${px(34)}`, fontSize: px(48) }}>
          {s.prompt}
        </div>
        <div style={{ padding: `${px(24)} ${px(26)} ${px(26)}` }}>
          <Tag className="stk-q__box" style={{ minHeight: px(108), borderRadius: px(30), fontSize: px(38), padding: `${px(10)} ${px(20)}` }} {...btn(() => onAsk?.(s))}>
            {interactive || state ? label : 'Toque para responder'}
          </Tag>
        </div>
      </div>
    );
  }

  if (s.type === 'mention') {
    return (
      <Tag className="stk stk-pill stk-mention" style={{ fontSize: px(60), padding: `${px(16)} ${px(34)}`, borderRadius: px(24) }} {...btn(() => onMention?.(s))}>
        <span className="stk-grad">@{s.handle}</span>
      </Tag>
    );
  }

  if (s.type === 'location') {
    return (
      <div className="stk stk-pill stk-location" style={{ fontSize: px(56), padding: `${px(16)} ${px(34)} ${px(16)} ${px(24)}`, borderRadius: px(24), gap: px(10) }}>
        <MapPin size={56 * k} strokeWidth={2.6} className="stk-location__pin" />
        <span className="stk-grad">{s.name}</span>
      </div>
    );
  }

  // story repostado: área invisível em cima do cartão (o cartão já está na foto)
  if (s.type === 'repost') {
    const w = (s.w || 0.6) * 1080;
    return (
      <Tag
        className="stk-repost"
        style={{ width: px(w), height: px(w * (s.ar || 16 / 9)) }}
        aria-label={`Story de @${s.handle}`}
        {...btn(() => onRepost?.(s))}
      />
    );
  }

  if (s.type === 'time') {
    const style = s.style || 'hora';
    return (
      <div className={`stk stk-time stk-time--${style}`} style={{ padding: `${px(14)} ${px(38)}`, borderRadius: px(30) }}>
        {style !== 'data' && (
          <span className="stk-time__hora" style={{ fontSize: px(style === 'ambos' ? 84 : 110) }}>
            {s.hora}
          </span>
        )}
        {style !== 'hora' && (
          <span className="stk-time__data" style={{ fontSize: px(style === 'ambos' ? 40 : 76) }}>
            {s.data}
          </span>
        )}
      </div>
    );
  }
  return null;
}

// Figurinhas por cima da foto do story, no visualizador.
// rect: área da foto na tela ({ left, top, width, height }, em px do container)
export function StickerOverlay({ stickers, state, rect, onVote, onAsk, onMention, onRepost }) {
  if (!rect || !stickers?.length) return null;
  const k = rect.width / 1080;
  const stop = (e) => e.stopPropagation();
  return (
    <div className="stk-overlay" style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}>
      {[...stickers]
        .sort((a, b) => (a.z || 0) - (b.z || 0))
        .map((s) => {
          const touchable = s.type === 'poll' || s.type === 'question' || s.type === 'mention' || s.type === 'repost';
          return (
            <div
              key={s.id}
              className={`stk-place ${touchable ? 'is-touchable' : ''}`}
              style={{
                left: `${s.x * 100}%`,
                top: `${s.y * 100}%`,
                transform: `translate(-50%, -50%) rotate(${s.rot || 0}rad) scale(${s.scale || 1})`,
              }}
              {...(touchable ? { onPointerDown: stop, onPointerUp: stop } : {})}
            >
              <StickerFace s={s} k={k} state={state} interactive={touchable} onVote={onVote} onAsk={onAsk} onMention={onMention} onRepost={onRepost} />
            </div>
          );
        })}
    </div>
  );
}

// ------------------------------- editor -------------------------------

// Escolher a figurinha
export function StickerPicker({ open, onClose, onPick }) {
  return (
    <Sheet open={open} onClose={onClose} title="Figurinhas">
      <div className="stk-picker">
        {STICKER_KINDS.map(({ type, label, Icon }) => (
          <button key={type} type="button" className={`stk-picker__item stk-picker__item--${type}`} onClick={() => onPick(type)}>
            <span className="stk-picker__icon">
              <Icon size={22} strokeWidth={2.4} />
            </span>
            {label}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

// Tela para escrever a enquete, a pergunta ou o local (por cima do editor)
export function StickerEditor({ initial, onDone, onDelete, onCancel }) {
  const [question, setQuestion] = useState(initial.question || '');
  const [options, setOptions] = useState(initial.options?.length ? initial.options : ['Sim', 'Não']);
  const [prompt, setPrompt] = useState(initial.prompt ?? 'Me faça uma pergunta');
  const [name, setName] = useState(initial.name || '');
  const first = useRef(null);
  useEffect(() => {
    setTimeout(() => first.current?.focus(), 60);
  }, []);
  const type = initial.type;
  const clean = options.map((o) => o.trim());
  const ok =
    type === 'poll' ? clean.filter(Boolean).length >= 2 && clean.every(Boolean) : type === 'question' ? prompt.trim() : type === 'location' ? name.trim() : true;
  const done = () => {
    if (!ok) return;
    if (type === 'poll') onDone({ ...initial, question: question.trim(), options: clean });
    else if (type === 'question') onDone({ ...initial, prompt: prompt.trim() });
    else if (type === 'location') onDone({ ...initial, name: name.trim().toUpperCase() });
  };
  return (
    <div className="text-editor stk-editor">
      <div className="text-editor__top">
        {initial.id ? (
          <button type="button" className="text-editor__cancel" onClick={onDelete}>
            Apagar
          </button>
        ) : (
          <button type="button" className="text-editor__cancel" onClick={onCancel}>
            Cancelar
          </button>
        )}
        <button type="button" className="text-editor__done" onClick={done} disabled={!ok}>
          Concluir
        </button>
      </div>
      <div className="stk-editor__body">
        {type === 'poll' && (
          <div className="stk-editor__card">
            <input ref={first} className="stk-editor__q" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Faça uma pergunta… (opcional)" maxLength={80} />
            {options.map((o, i) => (
              <div key={i} className="stk-editor__opt">
                <input
                  value={o}
                  onChange={(e) => setOptions((xs) => xs.map((x, j) => (j === i ? e.target.value : x)))}
                  placeholder={`Opção ${i + 1}`}
                  maxLength={30}
                  aria-label={`Opção ${i + 1}`}
                />
                {options.length > 2 && (
                  <button type="button" aria-label={`Tirar opção ${i + 1}`} onClick={() => setOptions((xs) => xs.filter((_, j) => j !== i))}>
                    <X size={16} />
                  </button>
                )}
              </div>
            ))}
            {options.length < 4 && (
              <button type="button" className="stk-editor__add" onClick={() => setOptions((xs) => [...xs, ''])}>
                <Plus size={16} /> Adicionar opção
              </button>
            )}
          </div>
        )}
        {type === 'question' && (
          <div className="stk-editor__card stk-editor__card--q">
            <textarea ref={first} rows={2} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Me faça uma pergunta" maxLength={80} />
            <div className="stk-editor__hint">Quem vê o story escreve a resposta aqui. Só você vê as respostas.</div>
          </div>
        )}
        {type === 'location' && (
          <div className="stk-editor__card">
            <div className="stk-editor__loc">
              <MapPin size={20} />
              <input ref={first} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do lugar" maxLength={40} />
            </div>
            <div className="stk-editor__hint">Pode ser um lugar do mundo da campanha.</div>
          </div>
        )}
      </div>
    </div>
  );
}

// Escolher quem mencionar
export function MentionPicker({ open, onClose, onPick, viewer }) {
  const [q, setQ] = useState('');
  const [list, setList] = useState(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = q.trim() ? await api.searchCharacters(q.trim(), viewer) : await api.followList(viewer, viewer, 'following');
        if (alive) setList(r || []);
      } catch {
        if (alive) setList([]);
      } finally {
        if (alive) setLoading(false);
      }
    }, 200);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q, open, viewer]);
  return (
    <Sheet open={open} onClose={onClose} title="Mencionar" className="sheet--tall">
      <div className="search-field search-field--sheet">
        <Search size={16} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pesquisar personagem" aria-label="Pesquisar personagem" />
      </div>
      {loading && !list && (
        <div className="center-pad">
          <Spinner />
        </div>
      )}
      {list?.length === 0 && <p className="muted center-pad">{q.trim() ? 'Ninguém encontrado.' : 'Pesquise pelo @ ou pelo nome.'}</p>}
      {list?.map((c) => (
        <button key={c.id} type="button" className="stk-mention-row" onClick={() => onPick(c)}>
          <Avatar character={c} size={40} />
          <span>
            <strong>{c.handle}</strong>
            <span className="muted">{c.name}</span>
          </span>
        </button>
      ))}
    </Sheet>
  );
}

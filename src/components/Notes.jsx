import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Music2, Send, Trash2 } from 'lucide-react';
import Avatar from './Avatar';
import MusicPicker, { MusicDetailsLine } from './MusicPicker';
import { MusicLine, SoundButton } from './Music';
import { Sheet, Button, Handle, useConfirm } from './ui';
import { useSession } from '../state/session';
import { useToast } from '../state/toast';
import { useAsync, useInterval } from '../lib/hooks';
import { cleanMusic, clipOf, musicForDb, musicLabel, player } from '../lib/music';
import { timeShort } from '../lib/format';
import * as api from '../lib/api';

export const NOTE_MAX = 60;

// Texto da nota que fica guardado na conversa quando alguém responde
export function noteSnapshot(note) {
  const m = cleanMusic(note?.music);
  const parts = [];
  if (note?.body) parts.push(note.body);
  if (m) parts.push(`♫ ${musicLabel(m)}`);
  return parts.join(' · ').slice(0, 200) || 'Nota';
}

// Balão de pensamento em cima da foto
export function NoteBubble({ note, placeholder = '', size = 'small' }) {
  const m = cleanMusic(note?.music);
  const empty = !note;
  return (
    <span className={`note-bubble note-bubble--${size} ${empty ? 'is-empty' : ''}`}>
      {m && (
        <span className="note-bubble__music">
          <Music2 size={size === 'big' ? 13 : 10} strokeWidth={2.4} aria-hidden="true" />
          <span>{m.title}</span>
        </span>
      )}
      {(note?.body || empty) && <span className="note-bubble__text">{note?.body || placeholder}</span>}
    </span>
  );
}

// Guarda a última nota aberta para a folha não ficar vazia enquanto fecha
function useLast(value) {
  const ref = useRef(value);
  if (value) ref.current = value;
  return value || ref.current;
}

// Deixar (ou apagar) a nota do personagem ativo
export function NoteEditorSheet({ open, onClose, note, onSaved }) {
  const { active } = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  const [text, setText] = useState('');
  const [music, setMusic] = useState(null);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const current = cleanMusic(note?.music);

  useEffect(() => {
    if (!open) return;
    setText('');
    setMusic(null);
    setBusy(false);
  }, [open]);

  const share = async (e) => {
    e.preventDefault();
    if (!text.trim() && !music) return;
    setBusy(true);
    try {
      await api.setNote(active.id, text.trim(), music ? musicForDb(music) : null);
      toast('Nota compartilhada');
      onSaved?.();
      onClose();
    } catch (err) {
      toast(api.errorMessage(err));
      setBusy(false);
    }
  };

  const remove = async () => {
    const ok = await confirm({ title: 'Apagar a nota?', confirmText: 'Apagar', danger: true });
    if (!ok) return;
    try {
      await api.deleteNote(active.id);
      toast('Nota apagada');
      onSaved?.();
      onClose();
    } catch (err) {
      toast(api.errorMessage(err));
    }
  };

  return (
    <>
      <Sheet open={open} onClose={onClose} title={note ? 'Sua nota' : 'Nova nota'}>
        <form className="note-edit" onSubmit={share}>
          {note && (
            <div className="note-edit__current">
              <div className="note-edit__current-text">
                <span className="note-edit__label">Nota atual</span>
                <span>{note.body || (current ? `♫ ${musicLabel(current)}` : '')}</span>
                {note.body && current && <span className="muted note-edit__music">♫ {musicLabel(current)}</span>}
                <span className="muted note-edit__time">{timeShort(note.created_at)}</span>
              </div>
              <button type="button" className="icon-btn" aria-label="Apagar nota" onClick={remove}>
                <Trash2 size={20} />
              </button>
            </div>
          )}
          <div className="note-edit__preview">
            <NoteBubble note={text.trim() || music ? { body: text.trim(), music: music ? musicForDb(music) : null } : null} placeholder="Compartilhe um pensamento..." size="big" />
            <Avatar character={active} size={72} />
          </div>
          <label className="note-edit__field">
            <textarea
              className="input"
              rows={2}
              value={text}
              onChange={(e) => setText(e.target.value.replace(/\n/g, ' '))}
              maxLength={NOTE_MAX}
              placeholder={note ? 'Escreva uma nota nova...' : 'Compartilhe um pensamento...'}
              aria-label="Texto da nota"
              enterKeyHint="send"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const f = e.currentTarget.form;
                  if (f?.requestSubmit) f.requestSubmit();
                  else f?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
                }
              }}
            />
            <span className="note-edit__count muted">
              {text.length}/{NOTE_MAX}
            </span>
          </label>
          {music ? (
            <MusicDetailsLine music={music} onOpen={() => setPicking(true)} onClear={() => setMusic(null)} />
          ) : (
            <button type="button" className="note-edit__music-btn" onClick={() => setPicking(true)}>
              <Music2 size={18} /> Adicionar música
            </button>
          )}
          <p className="muted note-edit__hint">Quem segue @{active.handle} vê sua nota no Direct por 24 horas.</p>
          <Button type="submit" variant="primary" className="btn--block" loading={busy} disabled={!text.trim() && !music}>
            Compartilhar
          </Button>
        </form>
      </Sheet>
      <MusicPicker open={picking} onClose={() => setPicking(false)} value={music} onChange={(m) => setMusic(m)} />
    </>
  );
}

// Ver a nota de alguém: ouvir a música e responder (vira mensagem no Direct)
export function NoteViewSheet({ note, onClose }) {
  const { active } = useSession();
  const toast = useToast();
  const navigate = useNavigate();
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const shown = useLast(note);
  const m = useMemo(() => cleanMusic(shown?.music), [shown]);
  const key = note && m ? `note:${note.id}` : null;

  // toca o trecho da música enquanto a nota está aberta
  useEffect(() => {
    if (!key) return undefined;
    player.request(key, clipOf(m));
    return () => player.release(key);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (note) setReply('');
  }, [note]);

  const send = async (e) => {
    e.preventDefault();
    const body = reply.trim();
    if (!body || !note) return;
    setBusy(true);
    try {
      const conv = await api.startConversation(active.id, [note.character.id]);
      await api.sendMessage({ conversation: conv, sender: active.id, kind: 'note_reply', body, noteBody: noteSnapshot(note) });
      toast('Resposta enviada');
      setReply('');
      onClose();
    } catch (err) {
      toast(api.errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={!!note} onClose={onClose}>
      {shown && (
        <div className="note-view">
          <button
            type="button"
            className="note-view__who"
            onClick={() => {
              onClose();
              navigate(`/u/${shown.character.handle}`);
            }}
          >
            <NoteBubble note={shown} size="big" />
            <Avatar character={shown.character} size={88} />
            <Handle character={shown.character} className="strong" />
            <span className="muted note-view__time">{timeShort(shown.created_at)}</span>
          </button>
          {m && (
            <div className="note-view__music">
              <MusicLine music={m} />
              {key && <SoundButton playerKey={key} size={16} />}
            </div>
          )}
          <form className="note-view__reply" onSubmit={send}>
            <input
              className="input"
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder={`Responder a ${shown.character.handle}...`}
              maxLength={500}
              aria-label="Resposta"
              enterKeyHint="send"
            />
            <button type="submit" className="icon-btn note-view__send" aria-label="Enviar" disabled={!reply.trim() || busy}>
              <Send size={22} />
            </button>
          </form>
        </div>
      )}
    </Sheet>
  );
}

// Fileira de notas no topo do Direct: a sua primeiro, depois as de quem você segue
export function NotesRow({ refreshKey = 0 }) {
  const { active } = useSession();
  const [editing, setEditing] = useState(false);
  const [viewing, setViewing] = useState(null);
  const { data, reload } = useAsync(`notes:${active.id}`, () => api.notesTray(active.id), [active.id]);

  useInterval(reload, 60000);
  useEffect(() => {
    if (refreshKey) reload();
  }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const list = data || [];
  const mine = list.find((n) => n.character.id === active.id) || null;
  const others = list.filter((n) => n.character.id !== active.id);

  return (
    <>
      <div className="notes" role="list" aria-label="Notas">
        <div role="listitem">
          <button type="button" className="note" onClick={() => setEditing(true)} aria-label={mine ? 'Sua nota' : 'Deixar uma nota'}>
            <NoteBubble note={mine} placeholder="Deixe uma nota..." />
            <Avatar character={active} size={64} />
            <span className="note__name muted">Sua nota</span>
          </button>
        </div>
        {others.map((n) => (
          <div key={n.id} role="listitem">
            <button type="button" className="note" onClick={() => setViewing(n)} aria-label={`Nota de ${n.character.handle}`}>
              <NoteBubble note={n} />
              <Avatar character={n.character} size={64} />
              <span className="note__name">{n.character.handle}</span>
            </button>
          </div>
        ))}
      </div>
      <NoteEditorSheet open={editing} onClose={() => setEditing(false)} note={mine} onSaved={reload} />
      <NoteViewSheet note={viewing} onClose={() => setViewing(null)} />
    </>
  );
}

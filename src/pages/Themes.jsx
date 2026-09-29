import { useEffect, useRef, useState } from 'react';
import { Check, Pencil, Plus, Trash2, ImagePlus } from 'lucide-react';
import { TopBar, BackButton, Button, Spinner, useConfirm } from '../components/ui';
import { useSession } from '../state/session';
import { useToast } from '../state/toast';
import { mediaPath, mediaUrl } from '../lib/supabase';
import { prepareImage, renderDmImage } from '../lib/media';
import {
  BASIC_THEMES,
  PRESET_THEMES,
  PATTERNS,
  MAX_CUSTOM,
  applyTheme,
  findTheme,
  getAppearance,
  isDarkColor,
  onAppearanceChange,
  themePreviewStyle,
} from '../lib/theme';
import * as api from '../lib/api';

const ACCENTS = ['#8b5cf6', '#d946ef', '#ec4899', '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1', '#a3a3a3'];
const BGS = {
  dark: ['#000000', '#0b0b12', '#0d0717', '#06121f', '#0b1510', '#140906', '#1a1a1a'],
  light: ['#ffffff', '#f6f0e4', '#fff5f8', '#f0f7ff', '#f0fdfa', '#fff7ed', '#f4f4f5'],
};
const ANGLES = [
  [180, '↓'],
  [135, '↘'],
  [90, '→'],
  [45, '↗'],
];

// Miniatura de um tema: um pedacinho do app com as cores dele
function ThemeCard({ t, active, onPick, onEdit }) {
  const split = t.split;
  return (
    <div className={`theme-card ${active ? 'is-active' : ''}`}>
      <button type="button" className="theme-card__btn" onClick={() => onPick(t)} aria-label={`Tema ${t.name}`} aria-pressed={active}>
        {split ? (
          <span className="theme-card__split">
            <ThemeMock t={{ ...t, mode: 'light', bg: '#ffffff', accent: '#7c3aed' }} />
            <ThemeMock t={{ ...t, mode: 'dark', bg: '#000000' }} />
          </span>
        ) : (
          <ThemeMock t={t} />
        )}
        {active && (
          <span className="theme-card__check">
            <Check size={14} strokeWidth={3} />
          </span>
        )}
      </button>
      <span className="theme-card__name">
        {t.name}
        {onEdit && (
          <button type="button" className="theme-card__edit" aria-label={`Editar ${t.name}`} onClick={() => onEdit(t)}>
            <Pencil size={13} />
          </button>
        )}
      </span>
    </div>
  );
}
function ThemeMock({ t }) {
  return (
    <span className="theme-mock" style={themePreviewStyle(t)}>
      <span className="theme-mock__bar" />
      <span className="theme-mock__post">
        <span className="theme-mock__avatar" />
        <span className="theme-mock__lines">
          <i />
          <i />
        </span>
      </span>
      <span className="theme-mock__bubble" />
      <span className="theme-mock__btn" />
    </span>
  );
}

let seq = 0;
const newId = () => `c${Date.now().toString(36)}${(seq++).toString(36)}`;
// foto de papel de parede enviada por nós (caminho no bucket)
const photoPath = (t) => (t?.wallpaper?.kind === 'image' ? mediaPath(t.wallpaper.url) : null);
// apaga fotos de papel de parede que nenhum tema guardado usa mais
function dropPhotos(paths, custom) {
  const used = new Set(custom.map(photoPath).filter(Boolean));
  const list = [...new Set(paths)].filter((p) => p && !used.has(p));
  if (list.length) api.removeFiles(list).catch(() => {});
}

export default function Themes() {
  const { uid, active, setAppearance } = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  const [appearance, setAppearanceState] = useState(getAppearance);
  const [draft, setDraft] = useState(null); // tema sendo criado/editado (aplicado na hora)
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInput = useRef(null);
  const draftRef = useRef(null);
  draftRef.current = draft;

  useEffect(() => onAppearanceChange(setAppearanceState), []);
  // prévia: o app inteiro muda enquanto edita; ao sair sem salvar, volta
  useEffect(() => {
    if (draft) applyTheme(draft);
  }, [draft]);
  useEffect(
    () => () => {
      const a = getAppearance();
      applyTheme(findTheme(a.active, a));
      // saiu da tela no meio da edição: a foto nova não fica perdida no bucket
      if (draftRef.current) dropPhotos([photoPath(draftRef.current)], a.custom);
    },
    []
  );

  const persist = async (next) => {
    setAppearanceState(next);
    try {
      return await setAppearance(next);
    } catch (e) {
      toast(api.errorMessage(e));
      return null;
    }
  };

  const pick = (t) => persist({ ...appearance, active: t.id });

  const startNew = () => {
    if (appearance.custom.length >= MAX_CUSTOM) {
      toast(`Dá para ter até ${MAX_CUSTOM} temas criados. Apague um antes.`);
      return;
    }
    const base = findTheme(appearance.active, appearance);
    const dark = base.mode === 'light' ? false : true;
    setDraft({
      id: newId(),
      name: 'Meu tema',
      mode: dark ? 'dark' : 'light',
      accent: base.accent || '#8b5cf6',
      bg: base.mode === 'auto' ? '#000000' : base.bg,
      wallpaper: base.wallpaper ? { ...base.wallpaper } : null,
      veil: base.veil ?? 0.8,
      isNew: true,
    });
    window.scrollTo(0, 0);
  };
  const cancel = () => {
    dropPhotos([photoPath(draft)], appearance.custom);
    setDraft(null);
    applyTheme(findTheme(appearance.active, appearance));
  };
  const save = async () => {
    const { isNew, ...t } = draft;
    t.name = t.name.trim().slice(0, 24) || 'Meu tema';
    const before = appearance.custom.find((x) => x.id === t.id);
    const custom = isNew ? [...appearance.custom, t] : appearance.custom.map((x) => (x.id === t.id ? t : x));
    setSaving(true);
    const ok = await persist({ active: t.id, custom });
    setSaving(false);
    if (ok) {
      setDraft(null);
      dropPhotos([photoPath(before)], ok.custom);
      toast(isNew ? 'Tema criado' : 'Tema salvo');
    }
  };
  const remove = async () => {
    const yes = await confirm({ title: `Apagar o tema "${draft.name}"?`, confirmText: 'Apagar', danger: true });
    if (!yes) return;
    const before = appearance.custom.find((x) => x.id === draft.id);
    const custom = appearance.custom.filter((x) => x.id !== draft.id);
    const activeId = appearance.active === draft.id ? 'auto' : appearance.active;
    const photos = [photoPath(draft), photoPath(before)];
    setDraft(null);
    const ok = await persist({ active: activeId, custom });
    if (ok) dropPhotos(photos, ok.custom);
    toast('Tema apagado');
  };

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const setMode = (mode) =>
    setDraft((d) => {
      const dark = mode === 'dark';
      const bg = isDarkColor(d.bg) === dark ? d.bg : BGS[mode][0];
      return { ...d, mode, bg };
    });
  const setWall = (kind) => {
    if (kind === 'image') {
      fileInput.current?.click();
      return;
    }
    dropPhotos([photoPath(draftRef.current)], getAppearance().custom);
    setDraft((d) => {
      if (kind === 'none') return { ...d, wallpaper: null };
      if (kind === 'gradient') return { ...d, wallpaper: { kind, from: d.accent, to: d.bg, angle: 160 }, veil: Math.min(d.veil ?? 0.7, 0.7) };
      return { ...d, wallpaper: { kind, pattern: 'pontos', color: d.accent }, veil: Math.max(d.veil ?? 0.85, 0.8) };
    });
  };
  const pickPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const prepared = await prepareImage(file, 1600);
      const { blob } = await renderDmImage(prepared.img);
      URL.revokeObjectURL(prepared.url);
      const path = await api.uploadImage(uid, active.id, 'temas', blob);
      // trocou a foto antes de salvar: a anterior (ainda não guardada) sai do bucket
      dropPhotos([photoPath(draftRef.current)], getAppearance().custom);
      set({ wallpaper: { kind: 'image', url: mediaUrl(path) }, veil: 0.6 });
    } catch (err) {
      toast(api.errorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  const wallKind = draft?.wallpaper?.kind || 'none';

  return (
    <div className="page themes-page">
      <TopBar left={draft ? null : <BackButton />} title={draft ? (draft.isNew ? 'Novo tema' : 'Editar tema') : 'Temas'} />
      {!draft && (
        <>
          <p className="muted small themes-page__intro">Toque num tema para usar. Ele muda as cores e o fundo do app todo.</p>
          <div className="theme-grid">
            {[...BASIC_THEMES, ...PRESET_THEMES].map((t) => (
              <ThemeCard key={t.id} t={t} active={appearance.active === t.id} onPick={pick} />
            ))}
          </div>
          <h3 className="section-title themes-page__title">Seus temas</h3>
          <div className="theme-grid">
            {appearance.custom.map((t) => (
              <ThemeCard key={t.id} t={t} active={appearance.active === t.id} onPick={pick} onEdit={(x) => setDraft({ ...x })} />
            ))}
            <div className="theme-card">
              <button type="button" className="theme-card__btn theme-card__new" onClick={startNew} aria-label="Criar tema">
                <Plus size={26} />
              </button>
              <span className="theme-card__name">Criar tema</span>
            </div>
          </div>
        </>
      )}

      {draft && (
        <div className="theme-editor">
          <p className="muted small">O app já muda enquanto você mexe. Se cancelar, volta ao tema de antes.</p>
          <label className="theme-editor__label" htmlFor="theme-name">
            Nome
          </label>
          <input id="theme-name" className="input" value={draft.name} maxLength={24} onChange={(e) => set({ name: e.target.value })} />

          <span className="theme-editor__label">Modo</span>
          <div className="segmented">
            {[
              ['light', 'Claro'],
              ['dark', 'Escuro'],
            ].map(([v, l]) => (
              <button key={v} type="button" className={draft.mode === v ? 'is-active' : ''} onClick={() => setMode(v)}>
                {l}
              </button>
            ))}
          </div>

          <span className="theme-editor__label">Cor de destaque</span>
          <div className="theme-swatches">
            {ACCENTS.map((c) => (
              <button key={c} type="button" className={`theme-swatch ${draft.accent === c ? 'is-on' : ''}`} style={{ background: c }} aria-label={`Destaque ${c}`} onClick={() => set({ accent: c })} />
            ))}
            <label className="theme-swatch theme-swatch--custom" aria-label="Outra cor de destaque">
              <input type="color" value={draft.accent} onChange={(e) => set({ accent: e.target.value })} />
            </label>
          </div>

          <span className="theme-editor__label">Cor do fundo</span>
          <div className="theme-swatches">
            {BGS[draft.mode].map((c) => (
              <button key={c} type="button" className={`theme-swatch ${draft.bg === c ? 'is-on' : ''}`} style={{ background: c }} aria-label={`Fundo ${c}`} onClick={() => set({ bg: c })} />
            ))}
            <label className="theme-swatch theme-swatch--custom" aria-label="Outra cor de fundo">
              <input type="color" value={draft.bg} onChange={(e) => set({ bg: e.target.value })} />
            </label>
          </div>

          <span className="theme-editor__label">Papel de parede</span>
          <div className="segmented">
            {[
              ['none', 'Nenhum'],
              ['gradient', 'Degradê'],
              ['pattern', 'Desenho'],
              ['image', 'Foto'],
            ].map(([v, l]) => (
              <button key={v} type="button" className={wallKind === v ? 'is-active' : ''} onClick={() => setWall(v)} disabled={uploading}>
                {l}
              </button>
            ))}
          </div>
          {wallKind === 'gradient' && (
            <div className="theme-editor__row">
              <label className="theme-color">
                De <input type="color" value={draft.wallpaper.from} onChange={(e) => set({ wallpaper: { ...draft.wallpaper, from: e.target.value } })} />
              </label>
              <label className="theme-color">
                Até <input type="color" value={draft.wallpaper.to} onChange={(e) => set({ wallpaper: { ...draft.wallpaper, to: e.target.value } })} />
              </label>
              {ANGLES.map(([a, l]) => (
                <button key={a} type="button" className={`theme-chip ${draft.wallpaper.angle === a ? 'is-on' : ''}`} onClick={() => set({ wallpaper: { ...draft.wallpaper, angle: a } })} aria-label={`Direção ${l}`}>
                  {l}
                </button>
              ))}
            </div>
          )}
          {wallKind === 'pattern' && (
            <div className="theme-editor__row">
              {PATTERNS.map((p) => (
                <button key={p.id} type="button" className={`theme-chip ${draft.wallpaper.pattern === p.id ? 'is-on' : ''}`} onClick={() => set({ wallpaper: { ...draft.wallpaper, pattern: p.id } })}>
                  {p.label}
                </button>
              ))}
              <label className="theme-color">
                Cor <input type="color" value={draft.wallpaper.color || draft.accent} onChange={(e) => set({ wallpaper: { ...draft.wallpaper, color: e.target.value } })} />
              </label>
            </div>
          )}
          {(wallKind === 'image' || uploading) && (
            <div className="theme-editor__row">
              <Button variant="secondary" className="btn--small" onClick={() => fileInput.current?.click()} disabled={uploading}>
                {uploading ? <Spinner size={14} className="spinner--inline" /> : <ImagePlus size={16} />} {wallKind === 'image' ? 'Trocar foto' : 'Escolher foto'}
              </Button>
            </div>
          )}
          {wallKind !== 'none' && (
            <>
              <label className="theme-editor__label" htmlFor="theme-veil">
                Quanto o papel de parede aparece
              </label>
              <input
                id="theme-veil"
                type="range"
                min={5}
                max={80}
                value={Math.round((1 - (draft.veil ?? 0.8)) * 100)}
                onChange={(e) => set({ veil: 1 - Number(e.target.value) / 100 })}
              />
            </>
          )}

          <span className="theme-editor__label">Como fica</span>
          <div className="theme-sample">
            <div className="theme-sample__post">
              <span className="theme-sample__avatar" />
              <div>
                <strong>noah.variavel</strong>
                <span className="muted small">Explorador de fissuras</span>
              </div>
              <Button className="btn--small">Seguir</Button>
            </div>
            <p>
              Primeiro dia na Fargus! <span className="theme-sample__link">#fissura</span>
            </p>
            <div className="theme-sample__chat">
              <span className="theme-sample__them">Bora na expedição?</span>
              <span className="theme-sample__me">Bora!</span>
            </div>
          </div>

          <div className="theme-editor__actions">
            <Button className="btn--block" loading={saving} disabled={uploading} onClick={save}>
              {draft.isNew ? 'Criar e usar' : 'Salvar e usar'}
            </Button>
            <Button variant="secondary" className="btn--block" onClick={cancel} disabled={saving}>
              Cancelar
            </Button>
            {!draft.isNew && (
              <Button variant="secondary" className="btn--block theme-editor__delete" onClick={remove} disabled={saving}>
                <Trash2 size={16} /> Apagar tema
              </Button>
            )}
          </div>
          <input ref={fileInput} type="file" accept="image/*" hidden onChange={pickPhoto} />
        </div>
      )}
    </div>
  );
}

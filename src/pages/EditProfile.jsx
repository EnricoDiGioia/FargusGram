import { useState } from 'react';
import { useNavigate } from 'react-router';
import { TopBar, Spinner, Button, useConfirm } from '../components/ui';
import AvatarPicker from '../components/AvatarPicker';
import { useSession } from '../state/session';
import { useToast } from '../state/toast';
import { emit } from '../lib/events';
import { pageCache } from '../lib/storage';
import { cleanHandle } from '../lib/format';
import * as api from '../lib/api';

export default function EditProfile() {
  const { active, uid, characters, patchCharacter, refreshMe, setActive } = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const [name, setName] = useState(active.name || '');
  const [handle, setHandle] = useState(active.handle);
  const [bio, setBio] = useState(active.bio || '');
  const [avatar, setAvatar] = useState(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setError('');
    if (!/^[a-z0-9._]{2,30}$/.test(handle)) {
      setError('O @ precisa ter de 2 a 30 caracteres: letras minúsculas, números, ponto ou _.');
      return;
    }
    setBusy(true);
    try {
      const fields = { name: name.trim(), handle, bio: bio.trim() };
      const oldAvatar = active.avatar_path;
      if (avatar?.blob) fields.avatar_path = await api.uploadImage(uid, active.id, 'avatars', avatar.blob);
      else if (removeAvatar) fields.avatar_path = null;
      const updated = await api.updateCharacter(active.id, fields);
      if (oldAvatar && fields.avatar_path !== undefined && oldAvatar !== fields.avatar_path) api.removeFiles([oldAvatar]).catch(() => {});
      patchCharacter(updated);
      pageCache.clear();
      emit('profile:change', { id: active.id });
      toast('Perfil atualizado');
      navigate(`/u/${updated.handle}`, { replace: true });
    } catch (err) {
      setError(api.errorMessage(err));
      setBusy(false);
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: `Excluir @${active.handle}?`,
      message: 'Todas as publicações, stories, comentários e mensagens deste personagem serão apagados para sempre.',
      confirmText: 'Excluir para sempre',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api.deleteCharacter(uid, active.id);
      const rest = characters.filter((c) => c.id !== active.id);
      pageCache.clear();
      if (rest[0]) setActive(rest[0].id);
      await refreshMe();
      toast('Personagem excluído');
      navigate('/', { replace: true });
    } catch (err) {
      toast(api.errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <TopBar
        left={
          <button type="button" className="link-plain" onClick={() => navigate(-1)}>
            Cancelar
          </button>
        }
        title="Editar perfil"
        right={
          <button type="button" className="link-accent" onClick={save} disabled={busy}>
            {busy ? <Spinner size={16} className="spinner--inline" /> : 'Concluir'}
          </button>
        }
        center
      />
      <div className="form">
        <AvatarPicker
          character={active}
          preview={avatar ? avatar.url : removeAvatar ? null : undefined}
          onPicked={(a) => {
            setAvatar(a);
            setRemoveAvatar(false);
          }}
          label="Alterar foto do perfil"
        />
        {(active.avatar_path || avatar) && !removeAvatar && (
          <button
            type="button"
            className="link-muted center small"
            onClick={() => {
              setAvatar(null);
              setRemoveAvatar(true);
            }}
          >
            Remover foto
          </button>
        )}
        <label className="field">
          <span>Nome</span>
          <input className="input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span>Nome de usuário</span>
          <div className="input-prefix">
            <span>@</span>
            <input
              className="input"
              value={handle}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck="false"
              onChange={(e) => setHandle(cleanHandle(e.target.value))}
            />
          </div>
        </label>
        <label className="field">
          <span>Bio</span>
          <textarea className="input" rows={4} maxLength={300} value={bio} onChange={(e) => setBio(e.target.value)} />
          <small className="muted">{bio.length}/300</small>
        </label>
        {error && <p className="form-error">{error}</p>}

        <div className="danger-zone">
          <Button variant="danger-ghost" onClick={remove} disabled={busy}>
            Excluir este personagem
          </Button>
        </div>
      </div>
    </div>
  );
}

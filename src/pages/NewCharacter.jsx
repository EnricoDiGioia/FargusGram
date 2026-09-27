import { useState } from 'react';
import { useNavigate } from 'react-router';
import { TopBar, BackButton, Button } from '../components/ui';
import AvatarPicker from '../components/AvatarPicker';
import { RiftMark } from '../components/Brand';
import { useSession } from '../state/session';
import { useToast } from '../state/toast';
import * as api from '../lib/api';
import { cleanHandle } from '../lib/format';

export default function NewCharacter({ first = false }) {
  const { uid, me, refreshMe, setActive, signOut } = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [handleTouched, setHandleTouched] = useState(false);
  const [bio, setBio] = useState('');
  const [avatar, setAvatar] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const onName = (v) => {
    setName(v);
    if (!handleTouched) setHandle(cleanHandle(v));
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!/^[a-z0-9._]{2,30}$/.test(handle)) {
      setError('O @ precisa ter de 2 a 30 caracteres: letras minúsculas, números, ponto ou _.');
      return;
    }
    setBusy(true);
    try {
      let c = await api.createCharacter(uid, { handle, name, bio });
      if (avatar?.blob) {
        try {
          const path = await api.uploadImage(uid, c.id, 'avatars', avatar.blob);
          c = await api.updateCharacter(c.id, { avatar_path: path });
        } catch (err) {
          toast('Personagem criado, mas a foto não subiu: ' + api.errorMessage(err));
        }
      }
      await refreshMe();
      setActive(c.id);
      toast(`@${c.handle} criado!`);
      navigate(first ? '/' : `/u/${c.handle}`, { replace: true });
    } catch (err) {
      setError(api.errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className="page">
      {first ? (
        <div className="onboard-head">
          <RiftMark size={44} />
          <h2>Bem-vindo, {me?.display_name}!</h2>
          <p className="muted">
            Agora crie o perfil do seu personagem. Depois dá para criar outros e alternar entre eles (o mestre pode usar isso para os NPCs).
          </p>
        </div>
      ) : (
        <TopBar left={<BackButton />} title="Novo personagem" />
      )}

      <form className="form" onSubmit={submit}>
        <AvatarPicker character={{ handle, name }} preview={avatar?.url ?? null} onPicked={setAvatar} label="Escolher foto" />

        <label className="field">
          <span>Nome</span>
          <input className="input" value={name} maxLength={60} onChange={(e) => onName(e.target.value)} placeholder="Ex.: Noah" required />
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
              onChange={(e) => {
                setHandleTouched(true);
                setHandle(cleanHandle(e.target.value));
              }}
              placeholder="noah.variavel"
              required
            />
          </div>
        </label>
        <label className="field">
          <span>Bio</span>
          <textarea className="input" rows={3} maxLength={300} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Explorador de fissuras, 1º ano…" />
        </label>

        {error && <p className="form-error">{error}</p>}
        <Button type="submit" loading={busy} className="btn--block" disabled={!name.trim() || !handle}>
          Criar personagem
        </Button>
        {first && (
          <button type="button" className="link-muted center" onClick={signOut}>
            Sair da conta
          </button>
        )}
      </form>
    </div>
  );
}

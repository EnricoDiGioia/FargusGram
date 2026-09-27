import { useState } from 'react';
import { Copy, KeyRound, Shield, BadgeCheck } from 'lucide-react';
import { TopBar, BackButton, Button, Spinner, ErrorBox, Handle, Sheet, useConfirm } from '../components/ui';
import Avatar from '../components/Avatar';
import { useSession } from '../state/session';
import { useToast } from '../state/toast';
import { useAsync } from '../lib/hooks';
import { pageCache } from '../lib/storage';
import { fullDate } from '../lib/format';
import * as api from '../lib/api';

export default function Admin() {
  const { isAdmin, me } = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  const { data, loading, error, reload, mutate } = useAsync('admin', () => api.admin.overview(), []);
  const [code, setCode] = useState(null);
  const [savingCode, setSavingCode] = useState(false);
  const [resetFor, setResetFor] = useState(null);
  const [newPw, setNewPw] = useState('');
  const [busy, setBusy] = useState(false);

  if (!isAdmin)
    return (
      <div className="page">
        <TopBar left={<BackButton />} title="Admin" />
        <p className="muted center-pad">Apenas administradores.</p>
      </div>
    );

  const link = data ? `${window.location.origin}${window.location.pathname}#/cadastro?convite=${encodeURIComponent(data.invite_code)}` : '';

  const copy = async (text, msg) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(msg);
    } catch {
      toast(text);
    }
  };

  const saveCode = async () => {
    setSavingCode(true);
    try {
      await api.admin.setInviteCode(code);
      mutate((d) => ({ ...d, invite_code: code.trim() }));
      setCode(null);
      toast('Código de convite alterado');
    } catch (e) {
      toast(api.errorMessage(e));
    } finally {
      setSavingCode(false);
    }
  };

  const toggleAdmin = async (p) => {
    const next = !p.is_admin;
    const ok = await confirm({
      title: next ? `Tornar ${p.display_name} admin?` : `Tirar admin de ${p.display_name}?`,
      message: next ? 'Admins podem apagar qualquer publicação, trocar o convite e redefinir senhas.' : undefined,
      confirmText: next ? 'Tornar admin' : 'Tirar admin',
      danger: !next,
    });
    if (!ok) return;
    try {
      await api.admin.setAdmin(p.id, next);
      reload();
    } catch (e) {
      toast(api.errorMessage(e));
    }
  };

  const toggleVerified = async (c) => {
    try {
      await api.admin.setVerified(c.id, !c.is_verified);
      pageCache.clear();
      reload();
      toast(!c.is_verified ? `@${c.handle} agora tem selo de verificado` : `Selo removido de @${c.handle}`);
    } catch (e) {
      toast(api.errorMessage(e));
    }
  };

  const resetPassword = async () => {
    setBusy(true);
    try {
      await api.admin.resetPassword(resetFor.id, newPw);
      toast(`Senha de ${resetFor.display_name} redefinida. Passe a nova senha para ele(a).`);
      setResetFor(null);
      setNewPw('');
    } catch (e) {
      toast(api.errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <TopBar left={<BackButton />} title="Painel do admin" />
      {loading && !data && (
        <div className="center-pad">
          <Spinner />
        </div>
      )}
      {error && <ErrorBox onRetry={reload}>{error}</ErrorBox>}
      {data && (
        <>
          <section className="settings-section">
            <h3 className="section-title">Código de convite</h3>
            <p className="muted small">Quem tiver este código consegue criar conta. Troque se ele vazar.</p>
            {code === null ? (
              <div className="invite-box">
                <code>{data.invite_code}</code>
                <Button variant="secondary" className="btn--small" onClick={() => setCode(data.invite_code)}>
                  Trocar
                </Button>
              </div>
            ) : (
              <div className="inline-form">
                <input className="input" value={code} onChange={(e) => setCode(e.target.value)} autoCapitalize="none" autoFocus />
                <Button className="btn--small" loading={savingCode} disabled={code.trim().length < 4} onClick={saveCode}>
                  Salvar
                </Button>
              </div>
            )}
            <Button variant="secondary" className="btn--block" onClick={() => copy(link, 'Link de convite copiado. Mande no grupo!')}>
              <Copy size={16} /> Copiar link de convite
            </Button>
          </section>

          <section className="settings-section">
            <h3 className="section-title">Jogadores ({data.players.length})</h3>
            {data.players.map((p) => (
              <div key={p.id} className="player-card">
                <div className="player-card__head">
                  <div>
                    <strong>
                      {p.display_name} {p.id === me.id && <span className="muted">(você)</span>}
                    </strong>
                    <span className="muted small">{p.email}</span>
                    <span className="muted small">Entrou em {fullDate(p.created_at)}</span>
                  </div>
                  {p.is_admin && (
                    <span className="pill pill--accent">
                      <Shield size={12} /> admin
                    </span>
                  )}
                </div>
                {p.characters.length > 0 && (
                  <div className="player-card__chars">
                    {p.characters.map((c) => (
                      <div key={c.id} className="player-char">
                        <Avatar character={c} size={32} />
                        <Handle character={c} />
                        <button
                          type="button"
                          className={`verify-toggle ${c.is_verified ? 'is-on' : ''}`}
                          onClick={() => toggleVerified(c)}
                          aria-label={c.is_verified ? 'Remover selo de verificado' : 'Dar selo de verificado'}
                          title="Selo de verificado"
                        >
                          <BadgeCheck size={20} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="player-card__actions">
                  <Button variant="secondary" className="btn--small" onClick={() => setResetFor(p)}>
                    <KeyRound size={14} /> Redefinir senha
                  </Button>
                  {p.id !== me.id && (
                    <Button variant="secondary" className="btn--small" onClick={() => toggleAdmin(p)}>
                      <Shield size={14} /> {p.is_admin ? 'Tirar admin' : 'Tornar admin'}
                    </Button>
                  )}
                </div>
              </div>
            ))}
            <p className="muted small">
              Para remover um jogador de vez, apague a conta dele no painel do Supabase (Authentication → Users). Tudo dele some junto.
            </p>
          </section>
        </>
      )}

      <Sheet open={!!resetFor} onClose={() => setResetFor(null)} title={resetFor ? `Nova senha para ${resetFor.display_name}` : ''}>
        <div className="pad-x pad-y form">
          <input className="input" type="text" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="Nova senha (mínimo 6)" autoCapitalize="none" />
          <Button className="btn--block" loading={busy} disabled={newPw.length < 6} onClick={resetPassword}>
            Redefinir senha
          </Button>
          <p className="muted small">Depois é só passar a senha nova para a pessoa. Ela pode trocar em Configurações.</p>
        </div>
      </Sheet>
    </div>
  );
}

import { lazy, Suspense, useState } from 'react';
import { useNavigate } from 'react-router';
import { Plus, Shield, LogOut, ChevronRight, Smartphone, Moon, KeyRound, UserRound, Star } from 'lucide-react';
import { TopBar, BackButton, Button, Handle } from '../components/ui';
import Avatar from '../components/Avatar';
import { InstallSteps } from '../components/InstallBanner';
import { useSession } from '../state/session';
import { useToast } from '../state/toast';
import { getTheme, setTheme } from '../lib/theme';
import * as api from '../lib/api';

const PushSettings = lazy(() => import('../components/PushSettings'));

export default function Settings() {
  const { me, session, characters, active, setActive, isAdmin, signOut, refreshMe, can } = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const [theme, setThemeState] = useState(getTheme());
  const [name, setName] = useState(me.display_name);
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(null);

  const saveName = async () => {
    setBusy('name');
    try {
      await api.updateDisplayName(me.id, name);
      await refreshMe();
      toast('Nome atualizado');
    } catch (e) {
      toast(api.errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const savePw = async () => {
    if (pw.length < 6) return toast('A senha precisa ter pelo menos 6 caracteres.');
    setBusy('pw');
    try {
      await api.auth.changePassword(pw);
      setPw('');
      toast('Senha alterada');
    } catch (e) {
      toast(api.errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="page">
      <TopBar left={<BackButton />} title="Configurações" />

      <section className="settings-section">
        <h3 className="section-title">Seus personagens</h3>
        {characters.map((c) => (
          <button
            key={c.id}
            type="button"
            className="settings-row"
            onClick={() => {
              setActive(c.id);
              navigate(`/u/${c.handle}`);
            }}
          >
            <Avatar character={c} size={40} />
            <span className="settings-row__label">
              <Handle character={c} />
              {c.name && <span className="muted small">{c.name}</span>}
            </span>
            {c.id === active.id ? <span className="pill">Usando</span> : <ChevronRight size={18} className="muted" />}
          </button>
        ))}
        <button type="button" className="settings-row" onClick={() => navigate('/novo-personagem')}>
          <span className="settings-row__icon">
            <Plus size={20} />
          </span>
          <span className="settings-row__label">Criar novo personagem</span>
        </button>
      </section>

      {can('melhores_amigos') && (
        <section className="settings-section">
          <button type="button" className="settings-row" onClick={() => navigate('/melhores-amigos')}>
            <span className="settings-row__icon settings-row__icon--close">
              <Star size={20} fill="currentColor" strokeWidth={0} />
            </span>
            <span className="settings-row__label">
              Melhores amigos
              <span className="muted small">Lista de @{active.handle}: quem vê seus stories e notas marcados</span>
            </span>
            <ChevronRight size={18} className="muted" />
          </button>
        </section>
      )}

      <section className="settings-section">
        <h3 className="section-title">
          <Moon size={15} /> Aparência
        </h3>
        <div className="segmented">
          {[
            ['auto', 'Automático'],
            ['light', 'Claro'],
            ['dark', 'Escuro'],
          ].map(([v, l]) => (
            <button
              key={v}
              type="button"
              className={theme === v ? 'is-active' : ''}
              onClick={() => {
                setTheme(v);
                setThemeState(v);
              }}
            >
              {l}
            </button>
          ))}
        </div>
      </section>

      <Suspense fallback={null}>
        <PushSettings />
      </Suspense>

      <section className="settings-section">
        <h3 className="section-title">
          <Smartphone size={15} /> Instalar no celular
        </h3>
        <InstallSteps />
      </section>

      <section className="settings-section">
        <h3 className="section-title">
          <UserRound size={15} /> Conta de jogador
        </h3>
        <p className="muted small">Entrou como {session.user.email}</p>
        <label className="field">
          <span>Seu nome (jogador)</span>
          <div className="inline-form">
            <input className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
            <Button variant="secondary" className="btn--small" loading={busy === 'name'} disabled={!name.trim() || name === me.display_name} onClick={saveName}>
              Salvar
            </Button>
          </div>
        </label>
        <label className="field">
          <span>
            <KeyRound size={13} /> Nova senha
          </span>
          <div className="inline-form">
            <input className="input" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Mínimo 6 caracteres" />
            <Button variant="secondary" className="btn--small" loading={busy === 'pw'} disabled={!pw} onClick={savePw}>
              Trocar
            </Button>
          </div>
        </label>
      </section>

      {isAdmin && (
        <section className="settings-section">
          <button type="button" className="settings-row" onClick={() => navigate('/admin')}>
            <span className="settings-row__icon settings-row__icon--accent">
              <Shield size={20} />
            </span>
            <span className="settings-row__label">
              Painel do admin
              <span className="muted small">Convites, jogadores, senhas e selos</span>
            </span>
            <ChevronRight size={18} className="muted" />
          </button>
        </section>
      )}

      <section className="settings-section">
        <button type="button" className="settings-row settings-row--danger" onClick={signOut}>
          <span className="settings-row__icon">
            <LogOut size={20} />
          </span>
          <span className="settings-row__label">Sair</span>
        </button>
      </section>

      <p className="muted small center pad-y">FargusGram · feito para a campanha Fargus</p>
    </div>
  );
}

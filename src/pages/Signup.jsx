import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { RiftMark } from '../components/Brand';
import { Button } from '../components/ui';
import { AuthInstallHint } from '../components/InstallBanner';
import { auth, errorMessage } from '../lib/api';

export default function Signup() {
  const [params] = useSearchParams();
  const [code, setCode] = useState(params.get('convite') || '');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('A senha precisa ter pelo menos 6 caracteres.');
      return;
    }
    setBusy(true);
    try {
      await auth.signUp(email, password, name, code);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <div className="auth__card">
        <div className="auth__brand">
          <RiftMark size={56} />
          <h1 className="wordmark wordmark--big">fargusgram</h1>
          <p className="muted">Crie sua conta de jogador. Depois você cria seus personagens.</p>
        </div>
        <form onSubmit={submit} className="auth__form">
          <input
            className="input"
            placeholder="Código de convite"
            autoCapitalize="none"
            autoComplete="off"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
          />
          <input
            className="input"
            placeholder="Seu nome (jogador, não personagem)"
            autoComplete="nickname"
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <input
            className="input"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            placeholder="E-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            placeholder="Senha (mínimo 6 caracteres)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <p className="form-error">{error}</p>}
          <Button type="submit" loading={busy} disabled={!code || !name || !email || !password} className="btn--block">
            Criar conta
          </Button>
        </form>
        <p className="auth__hint muted">O código de convite é passado pelo admin do grupo.</p>
      </div>
      <div className="auth__card auth__switch">
        Já tem conta? <Link to="/">Entrar</Link>
      </div>
      <AuthInstallHint />
    </div>
  );
}

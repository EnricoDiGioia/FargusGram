import { useState } from 'react';
import { Link } from 'react-router';
import { RiftMark } from '../components/Brand';
import { Button } from '../components/ui';
import { AuthInstallHint } from '../components/InstallBanner';
import { auth, errorMessage } from '../lib/api';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await auth.signIn(email, password);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <div className="auth__card">
        <div className="auth__brand">
          <RiftMark size={64} />
          <h1 className="wordmark wordmark--big">fargusgram</h1>
          <p className="muted">A rede social dos personagens de Fargus</p>
        </div>
        <form onSubmit={submit} className="auth__form">
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
            autoComplete="current-password"
            placeholder="Senha"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <p className="form-error">{error}</p>}
          <Button type="submit" loading={busy} disabled={!email || !password} className="btn--block">
            Entrar
          </Button>
        </form>
        <p className="auth__hint muted">Esqueceu a senha? Peça para o admin do grupo redefinir.</p>
      </div>
      <div className="auth__card auth__switch">
        Não tem conta? <Link to="/cadastro">Cadastre-se</Link>
      </div>
      <AuthInstallHint />
    </div>
  );
}

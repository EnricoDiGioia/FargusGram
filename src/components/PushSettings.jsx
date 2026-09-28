import { useEffect, useState } from 'react';
import { Bell, Send } from 'lucide-react';
import { Button, Handle } from './ui';
import Avatar from './Avatar';
import { useSession } from '../state/session';
import { useToast } from '../state/toast';
import { supabase } from '../lib/supabase';
import { platform } from '../lib/pwa';
import * as push from '../lib/push';

export function Switch({ checked, onChange, disabled, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`switch ${checked ? 'is-on' : ''}`}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}

function deniedHelp() {
  const p = platform();
  if (p.ios) return 'No iPhone: Ajustes → Notificações → FargusGram → Permitir Notificações.';
  if (p.android) return 'No Android: toque e segure o ícone do FargusGram → Informações do app → Notificações → Permitir.';
  return 'No navegador: clique no cadeado ao lado do endereço do site → Notificações → Permitir.';
}

export default function PushSettings() {
  const { uid, me, characters, refreshMe } = useSession();
  const toast = useToast();
  const support = push.pushSupport();
  const [enabled, setEnabled] = useState(null); // null = conferindo
  const [busy, setBusy] = useState(null);
  const [prefs, setPrefs] = useState(me?.push_prefs || {});
  const [permission, setPermission] = useState(support.permission);

  useEffect(() => {
    let alive = true;
    push.pushEnabled(uid).then((v) => alive && setEnabled(v));
    if (support.ok && support.permission !== 'denied') push.prefetchPushKey().catch(() => {});
    return () => {
      alive = false;
    };
  }, [uid]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setPrefs(me?.push_prefs || {});
  }, [me?.push_prefs]);

  const toggle = async (on) => {
    setBusy('toggle');
    try {
      if (on) {
        await push.enablePush(uid);
        toast('Notificações ativadas neste aparelho');
      } else {
        await push.disablePush();
        toast('Notificações desativadas neste aparelho');
      }
      setEnabled(on);
    } catch (err) {
      toast(err.message || 'Não deu para mudar as notificações.');
    } finally {
      setPermission(push.pushSupport().permission);
      setBusy(null);
    }
  };

  const test = async () => {
    setBusy('test');
    try {
      const r = await push.sendTestPush();
      if (!r.devices) toast('Nenhum aparelho seu está cadastrado. Ative as notificações primeiro.');
      else if (r.ok === r.devices) toast(r.devices === 1 ? 'Aviso de teste enviado. Deve chegar em alguns segundos.' : `Aviso de teste enviado para ${r.devices} aparelhos.`);
      else if (r.ok > 0) toast(`Enviado para ${r.ok} de ${r.devices} aparelhos. ${r.errors?.[0] || ''}`);
      else toast(`Não chegou em nenhum aparelho. ${r.errors?.[0] || ''}`);
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(null);
    }
  };

  const save = async (next) => {
    const before = prefs;
    setPrefs(next);
    const { error } = await supabase.from('players').update({ push_prefs: next }).eq('id', uid);
    if (error) {
      setPrefs(before);
      toast(/push_prefs/.test(error.message || '') ? 'O banco ainda não tem a atualização de notificações (veja o README).' : 'Não deu para salvar. Tente de novo.');
      return;
    }
    refreshMe();
  };

  const muted = push.mutedList(prefs);

  return (
    <section className="settings-section">
      <h3 className="section-title">
        <Bell size={15} /> Notificações
      </h3>

      {support.reason === 'ios-install' && (
        <p className="muted small">
          No iPhone, as notificações só funcionam com o app instalado. Abra o site no Safari, toque em <strong>Compartilhar</strong> →{' '}
          <strong>Adicionar à Tela de Início</strong> e depois abra o FargusGram pelo ícone para ativar aqui.
        </p>
      )}
      {support.reason === 'ios-old' && <p className="muted small">Para receber notificações, atualize o iPhone para o iOS 16.4 ou mais novo.</p>}
      {support.reason === 'unsupported' && (
        <p className="muted small">Este navegador não recebe notificações. No Android, use o Chrome; no iPhone, o app instalado pelo Safari.</p>
      )}
      {support.reason === 'dev' && <p className="muted small">As notificações só funcionam no site publicado (não no modo de desenvolvimento).</p>}

      {support.ok && (
        <>
          <div className="settings-row">
            <span className="settings-row__label">
              Receber neste aparelho
              <span className="muted small">
                {enabled
                  ? 'Ligado: os avisos chegam mesmo com o app fechado.'
                  : permission === 'denied'
                    ? 'Bloqueado nas configurações do aparelho.'
                    : 'Desligado neste aparelho.'}
              </span>
            </span>
            <Switch checked={!!enabled} disabled={enabled === null || !!busy} onChange={toggle} label="Receber notificações neste aparelho" />
          </div>
          {permission === 'denied' && !enabled && <p className="form-error small">As notificações estão bloqueadas. {deniedHelp()}</p>}
          {enabled && (
            <Button variant="secondary" className="btn--small push-test" loading={busy === 'test'} onClick={test}>
              <Send size={14} /> Enviar notificação de teste
            </Button>
          )}
        </>
      )}

      <h4 className="settings-sub">Avisar quando tiver</h4>
      {push.PUSH_KINDS.map((k) => (
        <div key={k.id} className="settings-row">
          <span className="settings-row__label">{k.label}</span>
          <Switch checked={push.prefOn(prefs, k.id)} onChange={(v) => save({ ...prefs, [k.id]: v })} label={k.label} />
        </div>
      ))}

      {characters.length > 1 && (
        <>
          <h4 className="settings-sub">De quais personagens</h4>
          <p className="muted small">Desligue os personagens de que não quer receber aviso (bom para NPCs).</p>
          {characters.map((c) => {
            const on = !muted.includes(c.id);
            return (
              <div key={c.id} className="settings-row">
                <Avatar character={c} size={32} />
                <span className="settings-row__label">
                  <Handle character={c} />
                </span>
                <Switch
                  checked={on}
                  label={`Avisos de ${c.handle}`}
                  onChange={(v) => save({ ...prefs, muted: v ? muted.filter((x) => x !== c.id) : [...muted, c.id] })}
                />
              </div>
            );
          })}
        </>
      )}
      <p className="muted small">As escolhas acima valem para todos os seus aparelhos.</p>
    </section>
  );
}

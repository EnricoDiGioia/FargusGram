import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Avatar from './Avatar';
import Cropper, { cropRect, defaultCrop } from './Cropper';
import { Button, Spinner } from './ui';
import { prepareImage, renderAvatar } from '../lib/media';
import { useToast } from '../state/toast';

// Escolher e recortar a foto de perfil. onPicked({ blob, url })
export default function AvatarPicker({ character, preview, onPicked, size = 88, label = 'Alterar foto' }) {
  const input = useRef(null);
  const toast = useToast();
  const [image, setImage] = useState(null);
  const [crop, setCrop] = useState(null);
  const [busy, setBusy] = useState(false);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const img = await prepareImage(file, 1200);
      setImage(img);
      setCrop(defaultCrop(img));
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  };

  const done = async () => {
    setBusy(true);
    try {
      const blob = await renderAvatar(image.img, cropRect(image, 1, crop));
      onPicked({ blob, url: URL.createObjectURL(blob) });
      URL.revokeObjectURL(image.url);
      setImage(null);
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="avatar-picker">
      <Avatar character={character} src={preview !== undefined ? preview : undefined} size={size} onClick={() => input.current?.click()} />
      <button type="button" className="link-accent" onClick={() => input.current?.click()} disabled={busy}>
        {busy && !image ? <Spinner size={14} className="spinner--inline" /> : label}
      </button>
      <input ref={input} type="file" accept="image/*" hidden onChange={onFile} />

      {image &&
        createPortal(
          <div className="crop-modal">
            <div className="crop-modal__bar">
              <button type="button" className="link-plain" onClick={() => setImage(null)}>
                Cancelar
              </button>
              <strong>Foto de perfil</strong>
              <button type="button" className="link-accent" onClick={done} disabled={busy}>
                {busy ? <Spinner size={16} className="spinner--inline" /> : 'Pronto'}
              </button>
            </div>
            <div className="crop-modal__body">
              <Cropper image={image} aspect={1} value={crop} onChange={setCrop} round />
              <p className="muted center">Arraste para posicionar. Use dois dedos para aproximar.</p>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

export function SmallButton(props) {
  return <Button variant="secondary" className="btn--small" {...props} />;
}

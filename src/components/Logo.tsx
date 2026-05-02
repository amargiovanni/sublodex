import { useState } from 'react';

/** Mostra `/logo.png` se l'utente lo ha salvato in `public/`,
 *  altrimenti un fallback testuale "SX" in Monokai orange. */
export function Logo({ size = 22 }: { size?: number }) {
  const [imgFailed, setImgFailed] = useState(false);

  if (imgFailed) {
    return (
      <span className="logo-mark" style={{ width: size, height: size }}>
        <span className="logo-mark__s">S</span>
        <span className="logo-mark__x">X</span>
      </span>
    );
  }
  return (
    <img
      src="/logo.png"
      alt="SublodeX"
      width={size}
      height={size}
      onError={() => setImgFailed(true)}
      style={{ display: 'block', objectFit: 'contain' }}
    />
  );
}

import { useEffect } from 'react';

// Informa ao CSS o tamanho da área visível (quando o teclado do celular abre, ela encolhe)
//  --vvh: altura visível   --vvtop: deslocamento do topo   --kb: altura coberta pelo teclado
export default function ViewportWatcher() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    const apply = () => {
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      root.style.setProperty('--vvh', `${vv.height}px`);
      root.style.setProperty('--vvtop', `${vv.offsetTop}px`);
      root.style.setProperty('--kb', `${kb > 60 ? kb : 0}px`);
    };
    apply();
    vv.addEventListener('resize', apply);
    vv.addEventListener('scroll', apply);
    return () => {
      vv.removeEventListener('resize', apply);
      vv.removeEventListener('scroll', apply);
    };
  }, []);
  return null;
}

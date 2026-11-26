export const STAGE_W = 1920;
export const STAGE_H = 1080;

export function createStage(el, canvas) {
  const refW = canvas?.refW ?? STAGE_W;
  const refH = canvas?.refH ?? STAGE_H;
  const match = canvas?.match ?? 0.5;
  const layout = () => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const s = Math.pow(vw / refW, 1 - match) * Math.pow(vh / refH, match);
    const ox = (vw - STAGE_W * s) / 2;
    const oy = (vh - STAGE_H * s) / 2;
    el.style.transform = `translate(${ox}px, ${oy}px) scale(${s})`;
    el.dataset.scale = String(s);
  };
  layout();
  window.addEventListener('resize', layout, { passive: true });
  return { layout, getScale: () => Number(el.dataset.scale) };
}

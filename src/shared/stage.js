// Logical 1000x2500 portrait stage that auto-fits the viewport.
// On the actual LED panel, devicePixelRatio + native resolution should match 1:1.
// In dev / on a regular monitor, we scale down so it always fits the window.

export const STAGE_W = 1000;
export const STAGE_H = 2500;

export function createStage(host) {
  host.style.position = 'fixed';
  host.style.inset = '0';
  host.style.background = '#050510';
  host.style.overflow = 'hidden';

  const stage = document.createElement('div');
  stage.id = 'stage';
  stage.style.position = 'absolute';
  stage.style.left = '50%';
  stage.style.top = '50%';
  stage.style.width = `${STAGE_W}px`;
  stage.style.height = `${STAGE_H}px`;
  stage.style.transformOrigin = 'center center';
  stage.style.background = 'radial-gradient(ellipse at 50% 38%, #15154a 0%, #07071a 55%, #030308 100%)';
  stage.style.boxShadow = '0 0 80px rgba(77, 210, 255, 0.08) inset';
  host.appendChild(stage);

  const fit = () => {
    const s = Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);
    stage.style.transform = `translate(-50%, -50%) scale(${s})`;
  };
  fit();
  window.addEventListener('resize', fit);

  return stage;
}

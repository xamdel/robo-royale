import { elements } from './elements.js';

export function createReticle() {
  // Target reticle
  elements.targetReticle = document.createElement('div');
  elements.targetReticle.className = 'target-reticle';

  // Reticle components
  const reticleTop = document.createElement('div');
  reticleTop.className = 'reticle-part reticle-top';

  const reticleRight = document.createElement('div');
  reticleRight.className = 'reticle-part reticle-right';

  const reticleBottom = document.createElement('div');
  reticleBottom.className = 'reticle-part reticle-bottom';

  const reticleLeft = document.createElement('div');
  reticleLeft.className = 'reticle-part reticle-left';

  const reticleCenter = document.createElement('div');
  reticleCenter.className = 'reticle-part reticle-center';

  elements.targetReticle.appendChild(reticleTop);
  elements.targetReticle.appendChild(reticleRight);
  elements.targetReticle.appendChild(reticleBottom);
  elements.targetReticle.appendChild(reticleLeft);
  elements.targetReticle.appendChild(reticleCenter);

  elements.container.appendChild(elements.targetReticle);
}

import { elements } from './elements.js';

// Store the main reticle element reference for easier access
let targetReticleElement = null;

export function createReticle() {
  // Target reticle
  elements.targetReticle = document.createElement('div');
  elements.targetReticle.className = 'target-reticle'; // Base class
  targetReticleElement = elements.targetReticle; // Store reference

  // Reticle components (keep the structure for potential future use)
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

  // Set initial style
  setReticleStyle('default');
}

export function setReticleStyle(styleName) {
  if (!targetReticleElement) {
    console.warn("[HUD Reticle] Cannot set style: Target reticle element not found.");
    return;
  }

  // Remove existing style classes first (add more styles here if needed)
  targetReticleElement.classList.remove('reticle-style-default', 'reticle-style-turret');

  // Add the new style class
  switch (styleName) {
    case 'turret':
      targetReticleElement.classList.add('reticle-style-turret');
      console.log("[HUD Reticle] Set style to 'turret'");
      break;
    case 'default':
    default:
      // Optionally add a default class if specific default styles are needed
      // targetReticleElement.classList.add('reticle-style-default');
      console.log("[HUD Reticle] Set style to 'default'");
      break;
  }
}

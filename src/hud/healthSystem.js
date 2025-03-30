import { Game } from '../game.js';
import { elements } from './elements.js';

export function createHealthSystem() {
  // Health container - bottom left, horizontal
  const healthContainer = document.createElement('div');
  healthContainer.className = 'health-container bottom-element';

  // Health icon
  const healthIcon = document.createElement('div');
  healthIcon.className = 'status-icon health-icon';
  healthIcon.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12,21.35L10.55,20.03C5.4,15.36 2,12.27 2,8.5C2,5.41 4.42,3 7.5,3C9.24,3 10.91,3.81 12,5.08C13.09,3.81 14.76,3 16.5,3C19.58,3 22,5.41 22,8.5C22,12.27 18.6,15.36 13.45,20.03L12,21.35Z"></path></svg>';
  healthContainer.appendChild(healthIcon);

  // Health bar wrapper
  const healthBarWrapper = document.createElement('div');
  healthBarWrapper.className = 'bar-wrapper health-bar-wrapper';

  // Health segments - horizontal
  const healthSegments = document.createElement('div');
  healthSegments.className = 'health-segments';
  for (let i = 0; i < 10; i++) {
    const segment = document.createElement('div');
    segment.className = 'segment';
    healthSegments.appendChild(segment);
  }
  healthBarWrapper.appendChild(healthSegments);

  // Health bar
  elements.healthBar = document.createElement('div');
  elements.healthBar.className = 'health-bar';
  healthBarWrapper.appendChild(elements.healthBar);

  // Health percentage
  const healthPercent = document.createElement('div');
  healthPercent.className = 'health-percent';
  healthBarWrapper.appendChild(healthPercent);

  healthContainer.appendChild(healthBarWrapper);
  elements.container.appendChild(healthContainer);
}

export function updateHealth() {
  // Get health from the Game object
  const healthPercent = (Game.health / Game.maxHealth) * 100;
  elements.healthBar.style.width = `${healthPercent}%`;

  // Update color based on health
  if (healthPercent < 25) {
    elements.healthBar.style.backgroundColor = '#ff0000';
  } else if (healthPercent < 50) {
    elements.healthBar.style.backgroundColor = '#ff9900';
  } else {
    elements.healthBar.style.backgroundColor = '#00aaff';
  }

  // Update health percentage text
  const healthPercentText = document.querySelector('.health-percent');
  if (healthPercentText) {
    healthPercentText.textContent = `${Math.round(healthPercent)}%`;
  }

  // Update health segments
  const segments = document.querySelectorAll('.health-segments .segment');
  const segmentCount = Math.ceil(healthPercent / 10);

  segments.forEach((segment, index) => {
    if (index < segmentCount) {
      segment.classList.add('active');

      // Color segments based on health
      if (healthPercent < 25) {
        segment.style.backgroundColor = 'rgba(255, 0, 0, 0.7)';
      } else if (healthPercent < 50) {
        segment.style.backgroundColor = 'rgba(255, 153, 0, 0.7)';
      } else {
        segment.style.backgroundColor = 'rgba(0, 170, 255, 0.7)';
      }
    } else {
      segment.classList.remove('active');
      segment.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
    }
  });

  // Update health icon color
  const healthIcon = document.querySelector('.health-icon');
  if (healthIcon) {
    if (healthPercent < 25) {
      healthIcon.style.color = '#ff0000';
    } else if (healthPercent < 50) {
      healthIcon.style.color = '#ff9900';
    } else {
      healthIcon.style.color = '#00aaff';
    }
  }
}

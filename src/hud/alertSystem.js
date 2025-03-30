import { elements } from './elements.js';
import { status } from './status.js';

export function createAlertSystem() {
  // Alert container
  elements.alertSystem = document.createElement('div');
  elements.alertSystem.className = 'alert-container';

  elements.container.appendChild(elements.alertSystem);
}

export function showAlert(message, type = 'info') {
  const now = performance.now();
  const lastShown = status.alertTimestamps[message];
  const cooldown = 2000; // 2 seconds cooldown for the same message

  // Prevent spamming the same message
  if (lastShown && (now - lastShown < cooldown)) {
    return; // Skip showing the alert
  }

  // Update timestamp for this message
  status.alertTimestamps[message] = now;

  // Create alert element
  const alert = document.createElement('div');
  alert.className = `alert alert-${type}`;
  alert.textContent = message;

  // Add to alerts container
  elements.alertSystem.appendChild(alert);

  // Remove after delay
  setTimeout(() => {
    alert.classList.add('alert-fade');
    setTimeout(() => {
      alert.remove();
    }, 500);
  }, 3000);
}

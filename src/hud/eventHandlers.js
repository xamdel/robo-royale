import { showAlert } from './alertSystem.js';
import { addMessage } from './messageLog.js';

export function showDamageIndicator(damage) {
  showAlert(`Damage taken: ${damage}!`, 'warning');
}

export function showDeathScreen(killerPlayerId) {
  showAlert('You were destroyed! Respawning...', 'danger');
}

export function hideDeathScreen() {
  // Clear any death alerts
}

export function showDamageNumber(damage, position) {
  showAlert(`Hit! Damage: ${damage}`, 'info');
}

export function showKillFeed(killerName, victimName) {
  // Updated to accept names and use addMessage
  addMessage(`${killerName} eliminated ${victimName}`);
}

export function showAmmoWarning(mountType, ammo) {
  addMessage(`Warning: ${mountType.toUpperCase()} weapon ammo low - ${ammo} remaining`);
}

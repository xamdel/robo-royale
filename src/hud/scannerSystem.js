import { config } from './config.js';
import { elements } from './elements.js';
import { Game } from '../game.js';

export function createScannerSystem() {
  // Scanner container - top left corner
  const scannerContainer = document.createElement('div');
  scannerContainer.className = 'scanner-container corner-element top-left';

  // Scanner display
  elements.scanner = document.createElement('div');
  elements.scanner.className = 'scanner-display';

  // Scanner label
  const scannerLabel = document.createElement('div');
  scannerLabel.className = 'scanner-label';
  scannerLabel.textContent = 'TACTICAL';
  elements.scanner.appendChild(scannerLabel);

  // Scanner sweep
  const scannerSweep = document.createElement('div');
  scannerSweep.className = 'scanner-sweep';
  elements.scanner.appendChild(scannerSweep);

  // Scanner grid
  const scannerGrid = document.createElement('div');
  scannerGrid.className = 'scanner-grid';
  elements.scanner.appendChild(scannerGrid);

  // Player indicator
  const playerIndicator = document.createElement('div');
  playerIndicator.className = 'player-indicator';
  elements.scanner.appendChild(playerIndicator);

  scannerContainer.appendChild(elements.scanner);

  elements.container.appendChild(scannerContainer);
}

export function updateScanner() {
  // Clear existing enemy indicators
  const enemyIndicators = elements.scanner.querySelectorAll('.enemy-indicator');
  enemyIndicators.forEach(indicator => indicator.remove());

  // Add indicators for other players
  if (Game.player && Game.otherPlayers) {
    Object.values(Game.otherPlayers).forEach(player => {
      if (player.mesh) {
        // Calculate relative position for the scanner
        const relativePos = getRelativePosition(Game.player.position, player.mesh.position);

        // Create enemy indicator
        const enemyIndicator = document.createElement('div');
        enemyIndicator.className = 'enemy-indicator';
        enemyIndicator.style.left = `${relativePos.x}px`;
        enemyIndicator.style.top = `${relativePos.y}px`;

        elements.scanner.appendChild(enemyIndicator);
      }
    });
  }
}

export function getRelativePosition(playerPos, enemyPos) {
  // Calculate relative position (simplified for 2D)
  const dx = enemyPos.x - playerPos.x;
  const dz = enemyPos.z - playerPos.z;

  // Scale to fit scanner display (50x50 pixels)
  const scannerSize = 50;
  const scaleFactor = scannerSize / (config.scannerRadius * 2);

  return {
    x: (dx * scaleFactor) + (scannerSize / 2),
    y: (dz * scaleFactor) + (scannerSize / 2)
  };
}

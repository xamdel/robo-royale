import { Game } from './game.js';
import { WeaponManager } from './weapons.js';

export const HUD = {
  elements: {
    container: null,
    healthBar: null,
    ammoCounter: null,
    weaponStatus: null,
    scanner: null,
    targetReticle: null,
    alertSystem: null,
    messageLogs: null,
  },

  config: {
    maxHealth: 100,
    maxAmmo: 50,
    scannerRadius: 50,
    updateRate: 50, // ms between HUD updates
  },

  status: {
    health: 100,
    ammo: 50,
    weaponActive: false,
    enemies: [],
    lastMessage: '',
    alerts: [],
  },

  lastUpdateTime: 0,

  init() {
    // Create HUD container
    this.elements.container = document.createElement('div');
    this.elements.container.id = 'mech-hud';
    document.body.appendChild(this.elements.container);

    this.createHealthSystem();
    this.createWeaponSystem();
    this.createScannerSystem();
    this.createReticle();
    this.createAlertSystem();
    this.createMessageLogs();

    // Add CSS styles
    this.addStyles();
  },

  createHealthSystem() {
    // Health container
    const healthContainer = document.createElement('div');
    healthContainer.className = 'hud-panel health-container';
    
    // Health label
    const healthLabel = document.createElement('div');
    healthLabel.className = 'hud-label';
    healthLabel.textContent = 'HULL INTEGRITY';
    healthContainer.appendChild(healthLabel);
    
    // Health bar wrapper
    const healthBarWrapper = document.createElement('div');
    healthBarWrapper.className = 'health-bar-wrapper';
    
    // Health bar
    this.elements.healthBar = document.createElement('div');
    this.elements.healthBar.className = 'health-bar';
    healthBarWrapper.appendChild(this.elements.healthBar);
    
    // Health percentage
    const healthPercent = document.createElement('div');
    healthPercent.className = 'health-percent';
    healthPercent.textContent = '100%';
    healthBarWrapper.appendChild(healthPercent);
    
    healthContainer.appendChild(healthBarWrapper);
    
    // Health segments
    const healthSegments = document.createElement('div');
    healthSegments.className = 'health-segments';
    for (let i = 0; i < 10; i++) {
      const segment = document.createElement('div');
      segment.className = 'segment';
      healthSegments.appendChild(segment);
    }
    healthContainer.appendChild(healthSegments);
    
    this.elements.container.appendChild(healthContainer);
  },

  createWeaponSystem() {
    // Weapon container
    const weaponContainer = document.createElement('div');
    weaponContainer.className = 'hud-panel weapon-container';
    
    // Weapon label
    const weaponLabel = document.createElement('div');
    weaponLabel.className = 'hud-label';
    weaponLabel.textContent = 'WEAPON SYSTEMS';
    weaponContainer.appendChild(weaponLabel);
    
    // Weapon status
    this.elements.weaponStatus = document.createElement('div');
    this.elements.weaponStatus.className = 'weapon-status';
    this.elements.weaponStatus.innerHTML = '<span class="status-inactive">NO WEAPON</span>';
    weaponContainer.appendChild(this.elements.weaponStatus);
    
    // Ammo counter
    const ammoWrapper = document.createElement('div');
    ammoWrapper.className = 'ammo-wrapper';
    
    // Ammo label
    const ammoLabel = document.createElement('div');
    ammoLabel.className = 'ammo-label';
    ammoLabel.textContent = 'AMMO';
    ammoWrapper.appendChild(ammoLabel);
    
    // Ammo counter
    this.elements.ammoCounter = document.createElement('div');
    this.elements.ammoCounter.className = 'ammo-counter';
    this.elements.ammoCounter.textContent = '0/0';
    ammoWrapper.appendChild(this.elements.ammoCounter);
    
    weaponContainer.appendChild(ammoWrapper);
    
    // Cooldown indicator
    const cooldownIndicator = document.createElement('div');
    cooldownIndicator.className = 'cooldown-indicator';
    
    const cooldownBar = document.createElement('div');
    cooldownBar.className = 'cooldown-bar';
    cooldownIndicator.appendChild(cooldownBar);
    
    weaponContainer.appendChild(cooldownIndicator);
    
    this.elements.container.appendChild(weaponContainer);
  },

  createScannerSystem() {
    // Scanner container
    const scannerContainer = document.createElement('div');
    scannerContainer.className = 'hud-panel scanner-container';
    
    // Scanner label
    const scannerLabel = document.createElement('div');
    scannerLabel.className = 'hud-label';
    scannerLabel.textContent = 'TACTICAL SCANNER';
    scannerContainer.appendChild(scannerLabel);
    
    // Scanner display
    this.elements.scanner = document.createElement('div');
    this.elements.scanner.className = 'scanner-display';
    
    // Scanner sweep
    const scannerSweep = document.createElement('div');
    scannerSweep.className = 'scanner-sweep';
    this.elements.scanner.appendChild(scannerSweep);
    
    // Player indicator
    const playerIndicator = document.createElement('div');
    playerIndicator.className = 'player-indicator';
    this.elements.scanner.appendChild(playerIndicator);
    
    scannerContainer.appendChild(this.elements.scanner);
    
    this.elements.container.appendChild(scannerContainer);
  },

  createReticle() {
    // Target reticle
    this.elements.targetReticle = document.createElement('div');
    this.elements.targetReticle.className = 'target-reticle';
    
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
    
    this.elements.targetReticle.appendChild(reticleTop);
    this.elements.targetReticle.appendChild(reticleRight);
    this.elements.targetReticle.appendChild(reticleBottom);
    this.elements.targetReticle.appendChild(reticleLeft);
    this.elements.targetReticle.appendChild(reticleCenter);
    
    this.elements.container.appendChild(this.elements.targetReticle);
  },

  createAlertSystem() {
    // Alert container
    this.elements.alertSystem = document.createElement('div');
    this.elements.alertSystem.className = 'alert-container';
    
    this.elements.container.appendChild(this.elements.alertSystem);
  },

  createMessageLogs() {
    // Message log container
    this.elements.messageLogs = document.createElement('div');
    this.elements.messageLogs.className = 'message-logs';
    
    this.elements.container.appendChild(this.elements.messageLogs);
  },

  update(deltaTime) {
    const now = performance.now();
    
    // Only update HUD at specified rate to avoid performance issues
    if (now - this.lastUpdateTime < this.config.updateRate) {
      return;
    }
    
    this.lastUpdateTime = now;
    
    // Update health
    this.updateHealth();
    
    // Update weapon status
    this.updateWeaponStatus();
    
    // Update scanner
    this.updateScanner();
  },
  
  updateHealth() {
    // In a real game, we'd get health from the Game object
    // For now, we'll just use the placeholder value
    const healthPercent = (this.status.health / this.config.maxHealth) * 100;
    this.elements.healthBar.style.width = `${healthPercent}%`;
    
    // Update color based on health
    if (healthPercent < 25) {
      this.elements.healthBar.style.backgroundColor = '#ff0000';
    } else if (healthPercent < 50) {
      this.elements.healthBar.style.backgroundColor = '#ff9900';
    } else {
      this.elements.healthBar.style.backgroundColor = '#00aaff';
    }
    
    // Update health percentage text
    const healthPercentText = this.elements.healthBar.parentNode.querySelector('.health-percent');
    if (healthPercentText) {
      healthPercentText.textContent = `${Math.round(healthPercent)}%`;
    }
  },
  
  updateWeaponStatus() {
    // Check if player has a weapon
    if (Game.cannonAttached) {
      this.status.weaponActive = true;
      
      // Get cooldown status
      const now = performance.now();
      const timeSinceLastFire = now - Game.lastFireTime;
      const cooldownPercent = Math.min(100, (timeSinceLastFire / Game.cooldownTime) * 100);
      
      // Update weapon ready status
      if (Game.ammo <= 0) {
        this.elements.weaponStatus.innerHTML = '<span class="status-inactive">OUT OF AMMO</span>';
      } else if (cooldownPercent < 100) {
        this.elements.weaponStatus.innerHTML = '<span class="status-charging">CHARGING</span>';
      } else {
        this.elements.weaponStatus.innerHTML = '<span class="status-active">CANNON READY</span>';
      }
      
      // Update ammo counter with game's actual ammo
      this.elements.ammoCounter.textContent = `${Game.ammo}/${Game.maxAmmo}`;
      
      // Update cooldown bar
      const cooldownBar = document.querySelector('.cooldown-bar');
      if (cooldownBar) {
        if (cooldownPercent < 100) {
          cooldownBar.style.transform = `scaleX(${cooldownPercent / 100})`;
          cooldownBar.style.backgroundColor = '#ff9900';
        } else {
          cooldownBar.style.transform = 'scaleX(1)';
          cooldownBar.style.backgroundColor = '#00aaff';
        }
      }
    } else {
      this.status.weaponActive = false;
      this.elements.weaponStatus.innerHTML = '<span class="status-inactive">NO WEAPON</span>';
      this.elements.ammoCounter.textContent = `0/0`;
      
      // Reset cooldown bar
      const cooldownBar = document.querySelector('.cooldown-bar');
      if (cooldownBar) {
        cooldownBar.style.transform = 'scaleX(0)';
      }
    }
  },
  
  updateScanner() {
    // Clear existing enemy indicators
    const enemyIndicators = this.elements.scanner.querySelectorAll('.enemy-indicator');
    enemyIndicators.forEach(indicator => indicator.remove());
    
    // Add indicators for other players
    if (Game.player && Game.otherPlayers) {
      Object.values(Game.otherPlayers).forEach(player => {
        if (player.mesh) {
          // Calculate relative position for the scanner
          const relativePos = this.getRelativePosition(Game.player.position, player.mesh.position);
          
          // Create enemy indicator
          const enemyIndicator = document.createElement('div');
          enemyIndicator.className = 'enemy-indicator';
          enemyIndicator.style.left = `${relativePos.x}px`;
          enemyIndicator.style.top = `${relativePos.y}px`;
          
          this.elements.scanner.appendChild(enemyIndicator);
        }
      });
    }
  },
  
  getRelativePosition(playerPos, enemyPos) {
    // Calculate relative position (simplified for 2D)
    const dx = enemyPos.x - playerPos.x;
    const dz = enemyPos.z - playerPos.z;
    
    // Scale to fit scanner display (50x50 pixels)
    const scannerSize = 50;
    const scaleFactor = scannerSize / (this.config.scannerRadius * 2);
    
    return {
      x: (dx * scaleFactor) + (scannerSize / 2),
      y: (dz * scaleFactor) + (scannerSize / 2)
    };
  },
  
  showAlert(message, type = 'info') {
    // Create alert element
    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.textContent = message;
    
    // Add to alerts container
    this.elements.alertSystem.appendChild(alert);
    
    // Remove after delay
    setTimeout(() => {
      alert.classList.add('alert-fade');
      setTimeout(() => {
        alert.remove();
      }, 500);
    }, 3000);
  },
  
  addMessage(message) {
    // Create message element
    const messageElement = document.createElement('div');
    messageElement.className = 'message';
    messageElement.textContent = message;
    
    // Add to message logs
    this.elements.messageLogs.appendChild(messageElement);
    
    // Remove old messages if too many
    const messages = this.elements.messageLogs.querySelectorAll('.message');
    if (messages.length > 5) {
      messages[0].remove();
    }
  },

  addStyles() {
    const style = document.createElement('style');
    style.textContent = `
      /* HUD Container */
      #mech-hud {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        font-family: 'Orbitron', 'Roboto Mono', monospace;
        color: #00aaff;
        text-shadow: 0 0 5px rgba(0, 170, 255, 0.7);
        z-index: 1000;
      }
      
      /* HUD Panels */
      .hud-panel {
        position: absolute;
        background-color: rgba(0, 20, 40, 0.5);
        border: 1px solid #00aaff;
        box-shadow: 0 0 10px rgba(0, 170, 255, 0.3), inset 0 0 5px rgba(0, 170, 255, 0.1);
        padding: 10px;
        box-sizing: border-box;
      }
      
      .hud-label {
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 1px;
        margin-bottom: 5px;
        text-align: center;
      }
      
      /* Health System */
      .health-container {
        top: 20px;
        left: 20px;
        width: 250px;
        height: 80px;
        border-radius: 5px;
      }
      
      .health-bar-wrapper {
        width: 100%;
        height: 20px;
        background-color: rgba(0, 0, 0, 0.5);
        border: 1px solid #00aaff;
        position: relative;
        border-radius: 3px;
        overflow: hidden;
      }
      
      .health-bar {
        height: 100%;
        width: 100%;
        background-color: #00aaff;
        transition: width 0.3s ease, background-color 0.3s ease;
      }
      
      .health-percent {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        font-size: 12px;
        text-shadow: 0 0 3px #000, 0 0 3px #000;
      }
      
      .health-segments {
        display: flex;
        width: 100%;
        margin-top: 5px;
      }
      
      .segment {
        flex: 1;
        height: 4px;
        background-color: rgba(0, 170, 255, 0.5);
        margin: 0 1px;
      }
      
      /* Weapon System */
      .weapon-container {
        top: 20px;
        right: 20px;
        width: 200px;
        height: 110px;
        border-radius: 5px;
      }
      
      .weapon-status {
        text-align: center;
        font-size: 14px;
        margin: 5px 0;
      }
      
      .status-active {
        color: #00ff00;
        text-shadow: 0 0 5px rgba(0, 255, 0, 0.7);
      }
      
      .status-inactive {
        color: #ff0000;
        text-shadow: 0 0 5px rgba(255, 0, 0, 0.7);
      }
      
      .status-charging {
        color: #ff9900;
        text-shadow: 0 0 5px rgba(255, 153, 0, 0.7);
      }
      
      .ammo-wrapper {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin: 10px 0;
      }
      
      .ammo-label {
        font-size: 12px;
      }
      
      .ammo-counter {
        font-size: 16px;
        font-weight: bold;
      }
      
      .cooldown-indicator {
        width: 100%;
        height: 5px;
        background-color: rgba(0, 0, 0, 0.5);
        border-radius: 3px;
        overflow: hidden;
      }
      
      .cooldown-bar {
        width: 100%;
        height: 100%;
        background-color: #00aaff;
        transform-origin: left;
        transition: transform 0.2s linear;
      }
      
      /* Scanner System */
      .scanner-container {
        bottom: 20px;
        left: 20px;
        width: 100px;
        height: 120px;
        border-radius: 5px;
      }
      
      .scanner-display {
        width: 80px;
        height: 80px;
        border-radius: 50%;
        border: 1px solid #00aaff;
        background-color: rgba(0, 20, 40, 0.7);
        position: relative;
        margin: 0 auto;
        overflow: hidden;
      }
      
      .scanner-sweep {
        position: absolute;
        top: 50%;
        left: 50%;
        width: 40px;
        height: 40px;
        margin-top: -40px;
        margin-left: 0;
        background: linear-gradient(90deg, transparent 50%, rgba(0, 170, 255, 0.4) 100%);
        border-radius: 50%;
        transform-origin: 0 100%;
        animation: sweep 4s infinite linear;
      }
      
      @keyframes sweep {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      
      .player-indicator {
        position: absolute;
        top: 50%;
        left: 50%;
        width: 6px;
        height: 6px;
        margin-left: -3px;
        margin-top: -3px;
        background-color: #00aaff;
        border-radius: 50%;
        box-shadow: 0 0 5px rgba(0, 170, 255, 0.7);
      }
      
      .enemy-indicator {
        position: absolute;
        width: 4px;
        height: 4px;
        margin-left: -2px;
        margin-top: -2px;
        background-color: #ff0000;
        border-radius: 50%;
        box-shadow: 0 0 5px rgba(255, 0, 0, 0.7);
      }
      
      /* Target Reticle */
      .target-reticle {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 50px;
        height: 50px;
      }
      
      .reticle-part {
        position: absolute;
        background-color: rgba(0, 170, 255, 0.7);
      }
      
      .reticle-top {
        top: 0;
        left: 50%;
        transform: translateX(-50%);
        width: 2px;
        height: 12px;
      }
      
      .reticle-right {
        top: 50%;
        right: 0;
        transform: translateY(-50%);
        width: 12px;
        height: 2px;
      }
      
      .reticle-bottom {
        bottom: 0;
        left: 50%;
        transform: translateX(-50%);
        width: 2px;
        height: 12px;
      }
      
      .reticle-left {
        top: 50%;
        left: 0;
        transform: translateY(-50%);
        width: 12px;
        height: 2px;
      }
      
      .reticle-center {
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 4px;
        height: 4px;
        border-radius: 50%;
        background-color: transparent;
        border: 1px solid rgba(0, 170, 255, 0.7);
      }
      
      /* Alert System */
      .alert-container {
        position: absolute;
        top: 120px;
        left: 50%;
        transform: translateX(-50%);
        width: 300px;
        display: flex;
        flex-direction: column;
        align-items: center;
      }
      
      .alert {
        width: 100%;
        padding: 10px;
        margin-bottom: 10px;
        text-align: center;
        border-radius: 5px;
        font-size: 14px;
        font-weight: bold;
        animation: fadeIn 0.3s ease;
        opacity: 0.9;
      }
      
      .alert-fade {
        animation: fadeOut 0.5s ease forwards;
      }
      
      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(-20px); }
        to { opacity: 0.9; transform: translateY(0); }
      }
      
      @keyframes fadeOut {
        from { opacity: 0.9; transform: translateY(0); }
        to { opacity: 0; transform: translateY(-20px); }
      }
      
      .alert-info {
        background-color: rgba(0, 100, 200, 0.7);
        border: 1px solid #00aaff;
        color: white;
      }
      
      .alert-warning {
        background-color: rgba(200, 100, 0, 0.7);
        border: 1px solid #ff9900;
        color: white;
      }
      
      .alert-danger {
        background-color: rgba(200, 0, 0, 0.7);
        border: 1px solid #ff0000;
        color: white;
      }
      
      /* Message Logs */
      .message-logs {
        position: absolute;
        bottom: 20px;
        right: 20px;
        width: 300px;
        max-height: 150px;
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }
      
      .message {
        background-color: rgba(0, 20, 40, 0.5);
        border: 1px solid #00aaff;
        border-radius: 5px;
        padding: 5px 10px;
        margin-bottom: 5px;
        font-size: 12px;
        animation: fadeIn 0.3s ease;
      }
      
      /* Dark edges gradient overlay */
      #mech-hud::after {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: radial-gradient(
          ellipse at center,
          transparent 60%,
          rgba(0, 20, 40, 0.5) 100%
        );
        pointer-events: none;
      }
      
      /* Responsive adjustments */
      @media (max-width: 800px) {
        .health-container {
          width: 180px;
          height: 70px;
        }
        
        .weapon-container {
          width: 150px;
          height: 100px;
        }
        
        .scanner-container {
          width: 90px;
          height: 110px;
        }
        
        .scanner-display {
          width: 70px;
          height: 70px;
        }
      }
    `;
    document.head.appendChild(style);
  }
};
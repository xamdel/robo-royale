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
  lastAmmoCount: null,

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

    // Add resize event listener for responsive scaling
    window.addEventListener('resize', this.updateScale.bind(this));
    
    // Initial scale update
    this.updateScale();
  },

  // Add to the HUD object
  showDamageIndicator(damage) {
    this.showAlert(`Damage taken: ${damage}!`, 'warning');
  },

  showDeathScreen(killerPlayerId) {
    this.showAlert('You were destroyed! Respawning...', 'danger');
  },

  hideDeathScreen() {
    // Clear any death alerts
  },

  showDamageNumber(damage, position) {
    this.showAlert(`Hit! Damage: ${damage}`, 'info');
  },

  showKillFeed(killedPlayerId) {
    this.showAlert('Enemy destroyed!', 'success');
  },

  updateAmmo(ammo) {
    // Already handled by updateWeaponStatus()
  },

  createHealthSystem() {
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
    this.elements.healthBar = document.createElement('div');
    this.elements.healthBar.className = 'health-bar';
    healthBarWrapper.appendChild(this.elements.healthBar);
    
    // Health percentage
    const healthPercent = document.createElement('div');
    healthPercent.className = 'health-percent';
    healthPercent.textContent = '100%';
    healthBarWrapper.appendChild(healthPercent);
    
    healthContainer.appendChild(healthBarWrapper);
    this.elements.container.appendChild(healthContainer);
  },

  createWeaponSystem() {
    // Weapon container - bottom right, horizontal
    const weaponContainer = document.createElement('div');
    weaponContainer.className = 'weapon-container bottom-element';
    
    // Weapon icon
    const weaponIcon = document.createElement('div');
    weaponIcon.className = 'status-icon weapon-icon';
    weaponIcon.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7,5H23V9H22V10H16V9H15V5H7V9H6V10H2V9H1V5H7M6,13H7V17H8V22H4V17H5V13H6M16,13H17V17H18V22H14V17H15V13H16Z"></path></svg>';
    weaponContainer.appendChild(weaponIcon);
    
    // Weapon status
    this.elements.weaponStatus = document.createElement('div');
    this.elements.weaponStatus.className = 'weapon-status';
    this.elements.weaponStatus.innerHTML = '<span class="status-inactive">NO WEAPON</span>';
    weaponContainer.appendChild(this.elements.weaponStatus);
    
    // Ammo display
    const ammoDisplay = document.createElement('div');
    ammoDisplay.className = 'ammo-display';
    
    // Ammo counter
    this.elements.ammoCounter = document.createElement('div');
    this.elements.ammoCounter.className = 'ammo-counter';
    this.elements.ammoCounter.textContent = '0/0';
    ammoDisplay.appendChild(this.elements.ammoCounter);
    
    // Ammo segments - horizontal
    const ammoSegments = document.createElement('div');
    ammoSegments.className = 'ammo-segments';
    for (let i = 0; i < 10; i++) {
      const segment = document.createElement('div');
      segment.className = 'segment';
      ammoSegments.appendChild(segment);
    }
    ammoDisplay.appendChild(ammoSegments);
    
    weaponContainer.appendChild(ammoDisplay);
    
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
    // Scanner container - top left corner
    const scannerContainer = document.createElement('div');
    scannerContainer.className = 'scanner-container corner-element top-left';
    
    // Scanner display
    this.elements.scanner = document.createElement('div');
    this.elements.scanner.className = 'scanner-display';
    
    // Scanner label
    const scannerLabel = document.createElement('div');
    scannerLabel.className = 'scanner-label';
    scannerLabel.textContent = 'TACTICAL';
    this.elements.scanner.appendChild(scannerLabel);
    
    // Scanner sweep
    const scannerSweep = document.createElement('div');
    scannerSweep.className = 'scanner-sweep';
    this.elements.scanner.appendChild(scannerSweep);
    
    // Scanner grid
    const scannerGrid = document.createElement('div');
    scannerGrid.className = 'scanner-grid';
    this.elements.scanner.appendChild(scannerGrid);
    
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
    
    // Message log title
    const messageTitle = document.createElement('div');
    messageTitle.className = 'message-title';
    messageTitle.innerHTML = '<span>COMMS</span>';
    this.elements.messageLogs.appendChild(messageTitle);
    
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
    // Get health from the Game object
    const healthPercent = (Game.health / Game.maxHealth) * 100;
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
        this.elements.weaponStatus.innerHTML = '<span class="status-inactive">NO AMMO</span>';
      } else if (cooldownPercent < 100) {
        this.elements.weaponStatus.innerHTML = '<span class="status-charging">CHARGING</span>';
      } else {
        this.elements.weaponStatus.innerHTML = '<span class="status-active">READY</span>';
      }
      
      // Update ammo counter with game's actual ammo
      this.elements.ammoCounter.textContent = `${Game.ammo}/${Game.maxAmmo}`;
      
      // Update ammo segments
      const ammoPercent = (Game.ammo / Game.maxAmmo) * 100;
      const segments = document.querySelectorAll('.ammo-segments .segment');
      const segmentCount = Math.ceil(ammoPercent / 10);
      
      segments.forEach((segment, index) => {
        if (index < segmentCount) {
          segment.classList.add('active');
          segment.style.backgroundColor = 'rgba(0, 255, 0, 0.7)';
        } else {
          segment.classList.remove('active');
          segment.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
        }
      });
      
      // Update cooldown bar
      const cooldownBar = document.querySelector('.cooldown-bar');
      if (cooldownBar) {
        if (cooldownPercent < 100) {
          cooldownBar.style.width = `${cooldownPercent}%`;
          cooldownBar.style.backgroundColor = '#ff9900';
        } else {
          cooldownBar.style.width = '100%';
          cooldownBar.style.backgroundColor = '#00aaff';
        }
      }
      
      // Only add a message when ammo value changes significantly
      if (this.lastAmmoCount !== null && this.lastAmmoCount !== Game.ammo && 
          (Game.ammo === 10 || Game.ammo === 5 || Game.ammo === 1)) {
        this.addMessage(`Warning: Ammo low - ${Game.ammo} remaining`);
      }
      
      this.lastAmmoCount = Game.ammo;
      
      // Update weapon icon
      const weaponIcon = document.querySelector('.weapon-icon');
      if (weaponIcon) {
        weaponIcon.style.color = Game.ammo <= 0 ? '#ff0000' : '#00ff00';
      }
    } else {
      this.status.weaponActive = false;
      this.elements.weaponStatus.innerHTML = '<span class="status-inactive">NO WEAPON</span>';
      this.elements.ammoCounter.textContent = `0/0`;
      
      // Reset ammo segments
      const segments = document.querySelectorAll('.ammo-segments .segment');
      segments.forEach(segment => {
        segment.classList.remove('active');
        segment.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
      });
      
      // Reset cooldown bar
      const cooldownBar = document.querySelector('.cooldown-bar');
      if (cooldownBar) {
        cooldownBar.style.width = '0%';
      }
      
      // Update weapon icon
      const weaponIcon = document.querySelector('.weapon-icon');
      if (weaponIcon) {
        weaponIcon.style.color = '#ff0000';
      }
      
      this.lastAmmoCount = null;
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
  
  updateScale() {
    // Get screen dimensions
    const width = window.innerWidth;
    const height = window.innerHeight;
    
    // Calculate appropriate scale based on screen size
    const baseSize = Math.min(width, height);
    const scale = baseSize / 1000; // 1000px is our reference size
    
    // Apply scale to root element for CSS variables
    document.documentElement.style.setProperty('--hud-scale', scale.toFixed(2));
    
    // Adjust specific elements if needed
    const scannerDisplay = document.querySelector('.scanner-display');
    if (scannerDisplay) {
      const scannerSize = Math.max(60, Math.min(100, baseSize / 10));
      scannerDisplay.style.width = `${scannerSize}px`;
      scannerDisplay.style.height = `${scannerSize}px`;
    }
  },

  addStyles() {
    const style = document.createElement('style');
    style.textContent = `
      /* Set root variables for scaling */
      :root {
        --hud-scale: 1;
        --hud-primary-color: #00aaff;
        --hud-warning-color: #ff9900;
        --hud-danger-color: #ff0000;
        --hud-success-color: #00ff00;
        --hud-bg-color: rgba(0, 20, 40, 0.5);
        --hud-glow: 0 0 5px rgba(0, 170, 255, 0.7);
      }
      
      /* HUD Container */
      #mech-hud {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        font-family: 'Orbitron', 'Roboto Mono', monospace;
        color: var(--hud-primary-color);
        text-shadow: var(--hud-glow);
        z-index: 1000;
      }
      
      /* Bottom elements - standard TPS health/ammo bars */
      .bottom-element {
        position: absolute;
        bottom: calc(20px * var(--hud-scale));
        display: flex;
        align-items: center;
        background-color: rgba(0, 20, 40, 0.3);
        border: calc(1px * var(--hud-scale)) solid var(--hud-primary-color);
        border-radius: calc(5px * var(--hud-scale));
        padding: calc(6px * var(--hud-scale));
        box-shadow: var(--hud-glow);
      }
      
      .health-container {
        left: calc(20px * var(--hud-scale));
        width: calc(260px * var(--hud-scale));
      }
      
      .weapon-container {
        right: calc(20px * var(--hud-scale));
        width: calc(260px * var(--hud-scale));
        flex-direction: column;
      }
      
      /* Icon styling */
      .status-icon {
        width: calc(30px * var(--hud-scale));
        height: calc(30px * var(--hud-scale));
        margin-right: calc(10px * var(--hud-scale));
        color: var(--hud-primary-color);
      }
      
      .status-icon svg {
        width: 100%;
        height: 100%;
      }
      
      /* Bar wrappers */
      .bar-wrapper {
        flex: 1;
        position: relative;
        height: calc(20px * var(--hud-scale));
        background-color: rgba(0, 0, 0, 0.5);
        border: calc(1px * var(--hud-scale)) solid var(--hud-primary-color);
        border-radius: calc(3px * var(--hud-scale));
        overflow: hidden;
      }
      
      /* Health System */
      .health-bar {
        height: 100%;
        width: 100%;
        background-color: var(--hud-primary-color);
        transition: width 0.3s ease, background-color 0.3s ease;
      }
      
      .health-percent {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        font-size: calc(12px * var(--hud-scale));
        text-shadow: 0 0 3px #000, 0 0 3px #000;
      }
      
      .health-segments {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: row;
        pointer-events: none;
      }
      
      .health-segments .segment {
        flex: 1;
        height: 100%;
        border-right: calc(1px * var(--hud-scale)) solid rgba(0, 0, 0, 0.3);
        background-color: rgba(255, 255, 255, 0.2);
        transition: background-color 0.3s ease;
      }
      
      .health-segments .segment.active {
        background-color: rgba(0, 170, 255, 0.7);
      }
      
      .health-segments .segment:last-child {
        border-right: none;
      }
      
      /* Weapon System */
      .weapon-status {
        font-size: calc(12px * var(--hud-scale));
        margin-bottom: calc(5px * var(--hud-scale));
        text-align: center;
        width: 100%;
      }
      
      .ammo-display {
        display: flex;
        flex-direction: column;
        width: 100%;
        margin-bottom: calc(5px * var(--hud-scale));
      }
      
      .ammo-counter {
        font-size: calc(14px * var(--hud-scale));
        font-weight: bold;
        text-align: center;
        margin-bottom: calc(3px * var(--hud-scale));
      }
      
      .ammo-segments {
        height: calc(6px * var(--hud-scale));
        width: 100%;
        display: flex;
        flex-direction: row;
      }
      
      .ammo-segments .segment {
        flex: 1;
        height: 100%;
        margin: 0 calc(1px * var(--hud-scale));
        background-color: rgba(255, 255, 255, 0.2);
        transition: background-color 0.3s ease;
      }
      
      .ammo-segments .segment.active {
        background-color: rgba(0, 255, 0, 0.7);
      }
      
      .status-active {
        color: var(--hud-success-color);
        text-shadow: 0 0 5px rgba(0, 255, 0, 0.7);
      }
      
      .status-inactive {
        color: var(--hud-danger-color);
        text-shadow: 0 0 5px rgba(255, 0, 0, 0.7);
      }
      
      .status-charging {
        color: var(--hud-warning-color);
        text-shadow: 0 0 5px rgba(255, 153, 0, 0.7);
      }
      
      .cooldown-indicator {
        width: 100%;
        height: calc(4px * var(--hud-scale));
        background-color: rgba(0, 0, 0, 0.5);
        border-radius: calc(2px * var(--hud-scale));
        overflow: hidden;
      }
      
      .cooldown-bar {
        height: 100%;
        width: 0%;
        background-color: var(--hud-primary-color);
        transition: width 0.2s linear, background-color 0.2s linear;
      }
      
      /* Corner elements */
      .corner-element {
        position: absolute;
        border-radius: calc(5px * var(--hud-scale));
      }
      
      .top-left {
        top: calc(20px * var(--hud-scale));
        left: calc(20px * var(--hud-scale));
      }
      
      /* Scanner System */
      .scanner-container {
        display: flex;
        align-items: center;
        justify-content: center;
      }
      
      .scanner-display {
        width: calc(80px * var(--hud-scale));
        height: calc(80px * var(--hud-scale));
        border-radius: 50%;
        border: calc(1px * var(--hud-scale)) solid var(--hud-primary-color);
        background-color: rgba(0, 20, 40, 0.7);
        position: relative;
        overflow: hidden;
        box-shadow: var(--hud-glow), inset 0 0 calc(10px * var(--hud-scale)) rgba(0, 0, 0, 0.5);
      }
      
      .scanner-label {
        position: absolute;
        top: calc(5px * var(--hud-scale));
        left: 50%;
        transform: translateX(-50%);
        font-size: calc(8px * var(--hud-scale));
        text-transform: uppercase;
        letter-spacing: calc(1px * var(--hud-scale));
        z-index: 1;
      }
      
      .scanner-grid {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-image: 
          linear-gradient(to right, rgba(0, 170, 255, 0.2) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(0, 170, 255, 0.2) 1px, transparent 1px);
        background-size: calc(10px * var(--hud-scale)) calc(10px * var(--hud-scale));
        opacity: 0.5;
      }
      
      .scanner-sweep {
        position: absolute;
        top: 50%;
        left: 50%;
        width: 50%;
        height: 50%;
        margin-top: -50%;
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
        width: calc(6px * var(--hud-scale));
        height: calc(6px * var(--hud-scale));
        margin-left: calc(-3px * var(--hud-scale));
        margin-top: calc(-3px * var(--hud-scale));
        background-color: var(--hud-primary-color);
        border-radius: 50%;
        box-shadow: var(--hud-glow);
        z-index: 2;
      }
      
      .enemy-indicator {
        position: absolute;
        width: calc(4px * var(--hud-scale));
        height: calc(4px * var(--hud-scale));
        margin-left: calc(-2px * var(--hud-scale));
        margin-top: calc(-2px * var(--hud-scale));
        background-color: var(--hud-danger-color);
        border-radius: 50%;
        box-shadow: 0 0 5px rgba(255, 0, 0, 0.7);
        z-index: 2;
      }
      
      /* Target Reticle */
      .target-reticle {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: calc(40px * var(--hud-scale));
        height: calc(40px * var(--hud-scale));
      }
      
      .reticle-part {
        position: absolute;
        background-color: rgba(0, 170, 255, 0.7);
      }
      
      .reticle-top {
        top: 0;
        left: 50%;
        transform: translateX(-50%);
        width: calc(2px * var(--hud-scale));
        height: calc(10px * var(--hud-scale));
      }
      
      .reticle-right {
        top: 50%;
        right: 0;
        transform: translateY(-50%);
        width: calc(10px * var(--hud-scale));
        height: calc(2px * var(--hud-scale));
      }
      
      .reticle-bottom {
        bottom: 0;
        left: 50%;
        transform: translateX(-50%);
        width: calc(2px * var(--hud-scale));
        height: calc(10px * var(--hud-scale));
      }
      
      .reticle-left {
        top: 50%;
        left: 0;
        transform: translateY(-50%);
        width: calc(10px * var(--hud-scale));
        height: calc(2px * var(--hud-scale));
      }
      
      .reticle-center {
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: calc(4px * var(--hud-scale));
        height: calc(4px * var(--hud-scale));
        border-radius: 50%;
        background-color: transparent;
        border: calc(1px * var(--hud-scale)) solid rgba(0, 170, 255, 0.7);
      }
      
      /* Alert System */
      .alert-container {
        position: absolute;
        top: calc(100px * var(--hud-scale));
        left: 50%;
        transform: translateX(-50%);
        width: calc(300px * var(--hud-scale));
        display: flex;
        flex-direction: column;
        align-items: center;
      }
      
      .alert {
        width: 100%;
        padding: calc(10px * var(--hud-scale));
        margin-bottom: calc(10px * var(--hud-scale));
        text-align: center;
        border-radius: calc(5px * var(--hud-scale));
        font-size: calc(14px * var(--hud-scale));
        font-weight: bold;
        animation: fadeIn 0.3s ease;
        opacity: 0.9;
      }
      
      .alert-fade {
        animation: fadeOut 0.5s ease forwards;
      }
      
      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(calc(-20px * var(--hud-scale))); }
        to { opacity: 0.9; transform: translateY(0); }
      }
      
      @keyframes fadeOut {
        from { opacity: 0.9; transform: translateY(0); }
        to { opacity: 0; transform: translateY(calc(-20px * var(--hud-scale))); }
      }
      
      .alert-info {
        background-color: rgba(0, 100, 200, 0.7);
        border: calc(1px * var(--hud-scale)) solid var(--hud-primary-color);
        color: white;
      }
      
      .alert-warning {
        background-color: rgba(200, 100, 0, 0.7);
        border: calc(1px * var(--hud-scale)) solid var(--hud-warning-color);
        color: white;
      }
      
      .alert-danger {
        background-color: rgba(200, 0, 0, 0.7);
        border: calc(1px * var(--hud-scale)) solid var(--hud-danger-color);
        color: white;
      }
      
      /* Message Logs */
      .message-logs {
        position: absolute;
        top: 50%;
        transform: translateY(-50%);
        right: calc(20px * var(--hud-scale));
        width: calc(300px * var(--hud-scale));
        max-height: calc(200px * var(--hud-scale));
        overflow: hidden;
        display: flex;
        flex-direction: column;
        background-color: rgba(0, 20, 40, 0.3);
        border: calc(1px * var(--hud-scale)) solid var(--hud-primary-color);
        border-radius: calc(5px * var(--hud-scale));
        padding: calc(5px * var(--hud-scale));
      }
      
      .message-title {
        text-align: center;
        font-size: calc(12px * var(--hud-scale));
        text-transform: uppercase;
        letter-spacing: calc(1px * var(--hud-scale));
        margin-bottom: calc(5px * var(--hud-scale));
        border-bottom: calc(1px * var(--hud-scale)) solid var(--hud-primary-color);
        padding-bottom: calc(3px * var(--hud-scale));
      }
      
      .message-title span {
        position: relative;
        padding: 0 calc(10px * var(--hud-scale));
      }
      
      .message-title span::before,
      .message-title span::after {
        content: '';
        position: absolute;
        top: 50%;
        width: calc(5px * var(--hud-scale));
        height: calc(1px * var(--hud-scale));
        background-color: var(--hud-primary-color);
      }
      
      .message-title span::before {
        left: 0;
      }
      
      .message-title span::after {
        right: 0;
      }
      
      .message {
        background-color: rgba(0, 20, 40, 0.5);
        border-radius: calc(3px * var(--hud-scale));
        padding: calc(5px * var(--hud-scale)) calc(20px * var(--hud-scale));
        margin-bottom: calc(5px * var(--hud-scale));
        font-size: calc(12px * var(--hud-scale));
        animation: fadeIn 0.3s ease, messagePulse 2s infinite;
        position: relative;
      }
      
      .message::before {
        content: '>';
        position: absolute;
        left: calc(8px * var(--hud-scale));
        top: calc(5px * var(--hud-scale));
        color: var(--hud-primary-color);
      }
      
      @keyframes messagePulse {
        0% { box-shadow: 0 0 5px rgba(0, 170, 255, 0.3); }
        50% { box-shadow: 0 0 10px rgba(0, 170, 255, 0.5); }
        100% { box-shadow: 0 0 5px rgba(0, 170, 255, 0.3); }
      }
      
      /* Tech overlay effect */
      #mech-hud::after {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: 
          radial-gradient(
            ellipse at center,
            transparent 70%,
            rgba(0, 20, 40, 0.3) 100%
          ),
          linear-gradient(
            to bottom,
            transparent 95%,
            rgba(0, 170, 255, 0.1) 100%
          );
        pointer-events: none;
      }
      
      /* Futuristic tech details */
      .health-container::before,
      .weapon-container::before {
        content: '';
        position: absolute;
        width: calc(5px * var(--hud-scale));
        height: calc(10px * var(--hud-scale));
        background-color: transparent;
      }
      
      .health-container::before {
        left: calc(-5px * var(--hud-scale));
        top: 50%;
        transform: translateY(-50%);
        border-top: calc(1px * var(--hud-scale)) solid var(--hud-primary-color);
        border-left: calc(1px * var(--hud-scale)) solid var(--hud-primary-color);
        border-bottom: calc(1px * var(--hud-scale)) solid var(--hud-primary-color);
      }
      
      .weapon-container::before {
        right: calc(-5px * var(--hud-scale));
        top: 50%;
        transform: translateY(-50%);
        border-top: calc(1px * var(--hud-scale)) solid var(--hud-primary-color);
        border-right: calc(1px * var(--hud-scale)) solid var(--hud-primary-color);
        border-bottom: calc(1px * var(--hud-scale)) solid var(--hud-primary-color);
      }
    `;
    document.head.appendChild(style);
  }
};
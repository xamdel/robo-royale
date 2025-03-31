import { Game } from '../game.js';
import { weaponSystem } from '../weapons/index.js';
import { elements } from './elements.js';
import { config } from './config.js';
import { status } from './status.js';
import { initializeScaleManager, updateScale } from './scaleManager.js';
import { createHealthSystem, updateHealth } from './healthSystem.js';
import { createWeaponSystem, updateWeaponStatus, updateWeaponDisplay } from './weaponSystemUI.js';
import { createScannerSystem, updateScanner } from './scannerSystem.js';
import { createReticle } from './reticle.js';
import { createAlertSystem, showAlert } from './alertSystem.js'; // Import showAlert
import { createMessageLogs, addMessage } from './messageLog.js';
import { showDamageIndicator, showDeathScreen, showKillFeed, showDamageNumber, showAmmoWarning } from './eventHandlers.js';
import { setupMouseListener, showWeaponContextMenu, hideWeaponContextMenu, getSelectedMountFromContextMenu } from './contextMenu.js';
import { showItemBadge, hideItemBadge } from './itemBadge.js'; // Import item badge functions

export const HUD = {
  elements,
  config,
  status,
  initialized: false, // Add initialization flag

  init() {
    // Prevent multiple initializations
    if (this.initialized) {
      console.warn("[HUD] Attempted to initialize HUD multiple times.");
      return;
    }
    this.initialized = true;
    console.log("[HUD] Initializing...");
    // Create HUD container
    elements.container = document.createElement('div');
    elements.container.id = 'mech-hud';
    document.body.appendChild(elements.container);

    createHealthSystem();
    createWeaponSystem();
    createScannerSystem();
    createReticle();
    createAlertSystem();
    createMessageLogs();

    // Add CSS styles
    // addStyles();

    // Initialize scale manager (adds resize listener and initial scale)
    initializeScaleManager();

    // Setup mouse listener for context menu
    setupMouseListener();

    // Make functions accessible globally via window.HUD
    // Check if window.HUD exists, create if not
    if (!window.HUD) {
        window.HUD = {};
    }
    window.HUD.updateWeaponDisplay = updateWeaponDisplay;
    window.HUD.showWeaponContextMenu = showWeaponContextMenu;
    window.HUD.hideWeaponContextMenu = hideWeaponContextMenu;
    window.HUD.getSelectedMountFromContextMenu = getSelectedMountFromContextMenu;
    window.HUD.showAlert = showAlert;
    window.HUD.addMessage = addMessage;
    window.HUD.showItemBadge = showItemBadge; // Expose item badge function
    window.HUD.hideItemBadge = hideItemBadge; // Expose item badge function


    // Update health display initially
    updateHealth();
  },

  update(deltaTime) {
    // Ensure HUD is initialized before updating
    if (!this.initialized) return;

    const now = performance.now();

    // Only update HUD at specified rate to avoid performance issues
    if (now - this.lastUpdateTime < config.updateRate) {
      return;
    }

    this.lastUpdateTime = now;

    // Update health
    updateHealth();

    // Update weapon status
    updateWeaponStatus();

    // Update scanner
    updateScanner();
  },

  lastUpdateTime: 0,

  // Expose event handlers directly
  showDamageIndicator: showDamageIndicator,
  showDeathScreen: showDeathScreen,
  showKillFeed: showKillFeed,
  showDamageNumber: showDamageNumber,
  showAmmoWarning: showAmmoWarning, // Added missing export from eventHandlers
  // Expose core alert/message functions directly for compatibility
  showAlert: showAlert,
  addMessage: addMessage,
  // Expose item badge functions
  showItemBadge: showItemBadge,
  hideItemBadge: hideItemBadge,
};

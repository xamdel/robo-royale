import { Game } from '../game.js';
// import { weaponSystem } from '../weapons/index.js'; // weaponSystem not directly used here
import { elements } from './elements.js';
import { config } from './config.js';
import { status } from './status.js';
import { initializeScaleManager, updateScale } from './scaleManager.js';
import { createHealthSystem, updateHealth } from './healthSystem.js';
import { createWeaponSystem, updateWeaponStatus, updateWeaponDisplay } from './weaponSystemUI.js';
import { createScannerSystem, updateScanner } from './scannerSystem.js';
import { createReticle, setReticleStyle } from './reticle.js'; // Import setReticleStyle
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

    // Create Interaction Prompt Element
    elements.interactionPrompt = document.createElement('div');
    elements.interactionPrompt.id = 'interaction-prompt';
    elements.interactionPrompt.style.position = 'absolute';
    elements.interactionPrompt.style.bottom = '25%'; // Position above center vertically
    elements.interactionPrompt.style.left = '50%';
    elements.interactionPrompt.style.transform = 'translateX(-50%)';
    elements.interactionPrompt.style.color = 'var(--hud-primary-color)'; // Use HUD primary color variable
    elements.interactionPrompt.style.fontSize = '1.8vh'; // Responsive font size
    elements.interactionPrompt.style.fontFamily = 'inherit'; // Inherit from #mech-hud container
    elements.interactionPrompt.style.textShadow = 'var(--hud-glow)'; // Use HUD glow variable
    elements.interactionPrompt.style.display = 'none'; // Hidden by default
    elements.container.appendChild(elements.interactionPrompt);


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
    window.HUD.showItemBadge = showItemBadge;
    window.HUD.hideItemBadge = hideItemBadge;
    window.HUD.showInteractionPrompt = this.showInteractionPrompt; // Expose new function
    window.HUD.hideInteractionPrompt = this.hideInteractionPrompt; // Expose new function
    window.HUD.showTurretReticle = this.showTurretReticle; // Expose new function
    window.HUD.hideTurretReticle = this.hideTurretReticle; // Expose new function


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

  // --- Interaction Prompt ---
  showInteractionPrompt(text) {
    if (elements.interactionPrompt) {
      elements.interactionPrompt.textContent = text;
      elements.interactionPrompt.style.display = 'block';
    }
  },

  hideInteractionPrompt() {
    if (elements.interactionPrompt) {
      elements.interactionPrompt.style.display = 'none';
    }
  },

  // --- Turret Reticle Control ---
  showTurretReticle() {
    console.log("[HUD] Switching to Turret Reticle");
    setReticleStyle('turret'); // Assumes 'turret' style exists in reticle.js
    // Optionally hide weapon UI elements if needed
    // if (elements.weaponInfo) elements.weaponInfo.style.display = 'none';
  },

  hideTurretReticle() {
    console.log("[HUD] Switching back to Default Reticle");
    setReticleStyle('default'); // Switch back to the default style
    // Optionally show weapon UI elements again
    // if (elements.weaponInfo) elements.weaponInfo.style.display = 'block';
  },
};

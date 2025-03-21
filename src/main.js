import { SceneManager } from './scene.js';
import { Game } from './game.js';
import { Network } from './network.js';
import * as THREE from 'three';

// Debug variables
let debugElements = {
  latency: null,
  packetLoss: null,
  updateRate: null,
  interpolationSpeed: null,
  overlay: null,
  toggle: null
};

// Debug state
let debugState = {
  enabled: false,
  showVisualHelpers: false
};

async function init() {
  // Initialize debug overlay elements after DOM is loaded
  debugElements.latency = document.getElementById('latency');
  debugElements.packetLoss = document.getElementById('packet-loss');
  debugElements.updateRate = document.getElementById('update-rate');
  debugElements.interpolationSpeed = document.getElementById('debug-interpolation-speed');
  debugElements.overlay = document.getElementById('debug-overlay');
  debugElements.toggle = document.getElementById('debug-toggle');
  
  // Set up debug toggle
  if (debugElements.toggle) {
    debugElements.toggle.addEventListener('click', toggleDebug);
  }
  
  // Set up interpolation speed controls
  document.getElementById('debug-interpolation-speed-up')?.addEventListener('click', () => {
    Network.interpolationSpeed += 1;
    updateInterpolationSpeedDisplay();
  });
  
  document.getElementById('debug-interpolation-speed-down')?.addEventListener('click', () => {
    if (Network.interpolationSpeed > 1) {
      Network.interpolationSpeed -= 1;
      updateInterpolationSpeedDisplay();
    }
  });
  
  SceneManager.init();
  Network.init();

  // --- Network Event Handlers for Debugging ---
  Network.socket.on('networkStats', (stats) => {
    if (!debugState.enabled) return;
    
    if (debugElements.latency) {
      debugElements.latency.innerText = `Latency: ${stats.latency.toFixed(0)} ms`;
    }
    if (debugElements.packetLoss) {
      debugElements.packetLoss.innerText = `Packet Loss: ${stats.packetLoss.toFixed(2)}%`;
    }
    if (debugElements.updateRate) {
      debugElements.updateRate.innerText = `Update Rate: ${stats.updateRate} ms`;
    }
    
    // Also log to console for debugging
    console.log('[Network Stats]', stats);
  });
  
  await Game.init(Network.socket);
  
  // Start the game loop
  lastTime = performance.now();
  requestAnimationFrame(gameLoop);
}

let lastTime = 0;
let lastNetworkUpdate = 0;
let lastSentMoveData = null; // Store last sent move data for update rate calculation
const WALK_UPDATE_RATE = 100; // ms between updates when walking
const RUN_UPDATE_RATE = 50;   // ms between updates when running

function gameLoop(timestamp) {
  const deltaTime = (timestamp - lastTime) / 1000; // Convert to seconds
  lastTime = timestamp;
  
  if (Game.player) {
    // Get movement data from Game.update()
    const moveData = Game.update(deltaTime);
    
    // Send position to server at a controlled rate based on movement speed
    const updateRate = Game.isRunning ? RUN_UPDATE_RATE : WALK_UPDATE_RATE;
    if (moveData && timestamp - lastNetworkUpdate > updateRate) {
      Network.sendMove(moveData);
      lastNetworkUpdate = timestamp;
      lastSentMoveData = moveData; // Store for update rate calculation
    }
  } else {
    // If no player, still update game state
    Game.update(deltaTime);
  }
  Network.update(deltaTime);  // Add network update for interpolation
  
  // Render the scene
    SceneManager.render(Game.player?.position);
  
  // Continue the game loop
  requestAnimationFrame(gameLoop);
}

// Toggle debug mode
function toggleDebug() {
  debugState.enabled = !debugState.enabled;
  
  // Update UI
  if (debugElements.toggle) {
    debugElements.toggle.innerText = `Debug: ${debugState.enabled ? 'ON' : 'OFF'}`;
  }
  
  if (debugElements.overlay) {
    debugElements.overlay.style.display = debugState.enabled ? 'block' : 'none';
  }
  
  // Update interpolation speed display
  updateInterpolationSpeedDisplay();
  
  // Toggle visual helpers
  debugState.showVisualHelpers = debugState.enabled;
  
  // Clear all debug helpers if turning off
  if (!debugState.enabled) {
    for (const id in SceneManager.debugHelpers) {
      SceneManager.scene.remove(SceneManager.debugHelpers[id]);
    }
    SceneManager.debugHelpers = {};
  }
  
  console.log(`Debug mode ${debugState.enabled ? 'enabled' : 'disabled'}`);
}

// Update interpolation speed display
function updateInterpolationSpeedDisplay() {
  if (debugElements.interpolationSpeed) {
    debugElements.interpolationSpeed.innerText = `Interp Speed: ${Network.interpolationSpeed}`;
  }
}

window.onload = init;

// Export debug state for other modules
export const Debug = {
  state: debugState
};

window.Game = Game;
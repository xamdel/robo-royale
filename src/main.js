import { SceneManager } from './scene.js';
import { Game } from './game.js';
import { Network } from './network.js';
import { DebugTools } from './debug-tools.js';
import { HUD } from './hud.js';
import { weaponSystem } from './weapons/index.js';
import { particleEffectSystem, initParticleEffectSystem } from './systems/ParticleEffectSystem.js';
import { EnvironmentalObjectSystem } from './environmentalObjectSystem.js'; // Import the system
import { TerrainGenerator } from './terrainGenerator.js'; // Import TerrainGenerator
import { modelManager } from './ModelManager.js'; // Import ModelManager
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
  
  try {
    if (!SceneManager || typeof SceneManager.init !== 'function') {
      throw new Error('SceneManager not properly initialized');
    }
    SceneManager.init();
    await EnvironmentalObjectSystem.init(); // Initialize environmental objects after scene
  } catch (error) {
    console.error('Failed to initialize SceneManager or EnvironmentalObjectSystem:', error);
    return;
  }
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
  
  // Initialize HUD after game is initialized
  HUD.init();
  
  // Initialize particle effect system
  const particleSystem = initParticleEffectSystem();
  if (particleSystem) {
    particleSystem.initialized = true;
    particleSystem.pools.impact.setSceneManager(SceneManager);
    particleSystem.pools.fire.setSceneManager(SceneManager);
    particleSystem.pools.smoke.setSceneManager(SceneManager);
    particleSystem.pools.smallFire.setSceneManager(SceneManager);
    SceneManager.add(particleSystem.flash);
  }
  
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
  
  // Update debug visualizations
  if (debugState.enabled) {
    DebugTools.updateDebugVisuals();
    DebugTools.updateNetworkDebugUI();
  }
  
  // Update HUD
  HUD.update(deltaTime);
  
  // Update particle effects
  particleEffectSystem.update();
  
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
  
  if (debugState.enabled) {
    // Initialize debug visualizations
    DebugTools.createDebugVisuals(SceneManager.scene);
  } else {
    // Clear all debug visualizations
    DebugTools.clearDebugVisuals(SceneManager.scene);
  }
  
  console.log(`Debug mode ${debugState.enabled ? 'enabled' : 'disabled'}`);
}

// Update interpolation speed display
function updateInterpolationSpeedDisplay() {
  if (debugElements.interpolationSpeed) {
    debugElements.interpolationSpeed.innerText = `Interp Speed: ${Network.interpolationSpeed}`;
  }
}

// Wrap initialization logic to handle async loading and seed reception
async function initializeGame() {
  console.log("[Main] Initializing game components...");

  // 1. Initialize Network first
  Network.init();

  // 2. Load building models asynchronously
  console.log("[Main] Starting building model loading...");
  await modelManager.loadModels();
  console.log("[Main] Building models loaded.");

  // 3. Wait for connection and map seed from the server
  //    (Simulating receiving the seed for now)
  const mapSeed = await new Promise(resolve => {
    // Replace this with actual network event listener when integrating server logic
    const receivedSeed = 'test_seed_123'; // Example seed
    console.log(`[Main] Received map seed: ${receivedSeed}`);
    resolve(receivedSeed);
    // Example using Network socket event:
    // Network.socket.once('mapData', (data) => {
    //   console.log(`[Main] Received map seed: ${data.seed}`);
    //   resolve(data.seed);
    // });
  });


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

  // 4. Initialize SceneManager with the seed, then other systems
  try {
    if (!SceneManager || typeof SceneManager.init !== 'function') {
      throw new Error('SceneManager not properly initialized');
    }
    // Pass the received seed to SceneManager
    SceneManager.init(mapSeed); // This initializes TerrainGenerator internally

    // Initialize environmental objects AFTER scene and terrain are ready
    if (TerrainGenerator.isInitialized && SceneManager.scene) {
      console.log("[Main] Initializing EnvironmentalObjectSystem...");
      const envSystem = new EnvironmentalObjectSystem(SceneManager.scene, TerrainGenerator);
      await envSystem.initialize(); // Call the async initialize method
      // No need to store envSystem globally unless other systems need it
    } else {
      console.error("[Main] Cannot initialize EnvironmentalObjectSystem: TerrainGenerator or Scene not ready.");
    }

  } catch (error) {
    console.error('Failed to initialize SceneManager or EnvironmentalObjectSystem:', error); // Updated error message
    return; // Stop initialization if critical systems fail
  }


  // --- Network Event Handlers for Debugging ---
  // (Moved Network.init() earlier)
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

  // 5. Initialize Game AFTER network and scene are ready
  await Game.init(Network.socket);

  // Initialize HUD after game is initialized
  HUD.init();

  // Initialize particle effect system
  const particleSystem = initParticleEffectSystem();
  if (particleSystem) {
    particleSystem.initialized = true;
    particleSystem.pools.impact.setSceneManager(SceneManager);
    particleSystem.pools.fire.setSceneManager(SceneManager);
    particleSystem.pools.smoke.setSceneManager(SceneManager);
    particleSystem.pools.smallFire.setSceneManager(SceneManager);
    SceneManager.add(particleSystem.flash);
  }

  // 6. Start the game loop
  console.log("[Main] Initialization complete. Starting game loop.");
  lastTime = performance.now();
  requestAnimationFrame(gameLoop);
}


window.onload = initializeGame; // Use the new initialization function

// Export debug state for other modules
export const Debug = {
  state: debugState
};

// Make these available globally for cross-module access
window.Game = Game;
window.HUD = HUD;

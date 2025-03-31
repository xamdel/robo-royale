import { SceneManager } from './scene.js';
import { Game } from './game.js';
import { Network } from './network.js';
import { DebugTools } from './debug-tools.js';
import { HUD } from './hud/index.js';
import { Leaderboard } from './leaderboard.js'; // Import Leaderboard
import { weaponSystem } from './weapons/index.js';
import { particleEffectSystem, initParticleEffectSystem } from './systems/ParticleEffectSystem.js';
import { DamageNumberSystem } from './systems/DamageNumberSystem.js'; // Import DamageNumberSystem
import { EnvironmentalObjectSystem } from './environmentalObjectSystem.js'; // Import the system
import { TerrainGenerator } from './terrainGenerator.js'; // Import TerrainGenerator
import { modelManager } from './ModelManager.js'; // Import ModelManager
import { audioManager } from './audio/AudioManager.js'; // Import the audio manager instance
import * as THREE from 'three';
import { WelcomeScreen } from './welcome/WelcomeScreen.js'; // Import WelcomeScreen

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

// This older init function might be redundant now with initializeGame,
// but keeping it for now in case it's called elsewhere unexpectedly.
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
    // Assuming SceneManager.init now takes the seed, pass null or handle appropriately
    SceneManager.init(null); // Or fetch seed if needed here
    // EnvironmentalObjectSystem initialization moved to initializeGame
  } catch (error) {
    console.error('Failed to initialize SceneManager:', error);
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

  // Initialize Leaderboard immediately after HUD
  Leaderboard.init();

  // Initialize particle effect system (passing the scene) - Corrected Call
  if (SceneManager.scene) {
    initParticleEffectSystem(SceneManager.scene);
  } else {
    console.error("[Main-init] Cannot initialize ParticleEffectSystem: Scene not ready.");
  }

  // Initialize Damage Number System
  if (SceneManager.scene) {
    DamageNumberSystem.init(SceneManager.scene);
  } else {
     console.error("[Main-init] Cannot initialize DamageNumberSystem: Scene not ready.");
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

  // Update particle effects (passing the camera) - Corrected Call
  if (particleEffectSystem && SceneManager.camera) {
    particleEffectSystem.update(SceneManager.camera);
  }

  // Update damage numbers
  if (window.damageNumberSystem) {
    window.damageNumberSystem.update(deltaTime);
  }

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

  // --- Welcome Screen Logic ---
  // Show welcome screen or get saved data
  let userData;
  if (!WelcomeScreen.hasBeenShown()) {
    console.log("[Main] Showing Welcome Screen...");
    userData = await WelcomeScreen.show(); // Wait for user interaction (returns { primary: '...', name: '...' })
    console.log("[Main] Welcome Screen finished. User data:", userData);
  } else {
    console.log("[Main] Welcome Screen already shown, loading saved data.");
    // Load saved data if screen isn't shown (getSavedData is internal, need to call it)
    // We can assume WelcomeScreen saved it, so we can retrieve it directly here if needed,
    // but Game.init will likely handle loading it if not passed. Let's get it from storage.
    // Re-reading from storage ensures consistency if WelcomeScreen logic changes.
    const saved = localStorage.getItem('roboRoyaleUserData');
    if (saved) {
        try {
            const parsedData = JSON.parse(saved);
            // Basic validation again, similar to WelcomeScreen's getSavedData
             userData = {
                primary: parsedData.primary && /^#[0-9A-F]{6}$/i.test(parsedData.primary) ? parsedData.primary : '#00ffff',
                name: parsedData.name && typeof parsedData.name === 'string' && parsedData.name.trim().length > 0 ? parsedData.name.trim() : 'MechPilot'
            };
             console.log("[Main] Loaded saved user data:", userData);
        } catch (e) {
             console.error("Error reading saved user data in main.js:", e);
             userData = { primary: '#00ffff', name: 'MechPilot' }; // Fallback defaults
        }
    } else {
         userData = { primary: '#00ffff', name: 'MechPilot' }; // Fallback defaults
    }
  }
  // --- End Welcome Screen Logic ---


  // Now proceed with game initialization, potentially using playerColors

  // 1. Initialize Network first
  Network.init();

  // Send player customization data after network is initialized
  Network.sendPlayerCustomization(userData); // Send full user data object


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

    // Initialize AudioManager AFTER scene and camera are ready
    if (SceneManager.camera) {
      audioManager.init(SceneManager.camera);
      window.AudioManager = audioManager; // Make it globally accessible
      console.log("[Main] AudioManager initialized and attached to window.");

      // Preload weapon sounds
      console.log("[Main] Preloading weapon sounds...");
      audioManager.loadSound('cannon.wav');
      audioManager.loadSound('rocket.wav');
      // Preload gatling sounds too, might need them later
      audioManager.loadSound('gatling-fire.wav');
      audioManager.loadSound('gatling-spinup.wav');
      audioManager.loadSound('gatling-spindown.wav');
      console.log("[Main] Weapon sounds preloading initiated.");
    } else {
      console.error("[Main] Cannot initialize AudioManager: SceneManager camera not ready.");
    }

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

  // 5. Initialize Game AFTER network and scene are ready, passing the user data
  await Game.init(Network.socket, userData);

  // Initialize HUD after game is initialized
  HUD.init();

  // Initialize Leaderboard after HUD
  Leaderboard.init();
  console.log("[Main] Leaderboard initialized."); // Add log

  // Initialize particle effect system (passing the scene) - Corrected Call
  if (SceneManager.scene) {
    initParticleEffectSystem(SceneManager.scene);
  } else {
    console.error("[Main-initializeGame] Cannot initialize ParticleEffectSystem: Scene not ready.");
  }

  // Initialize Damage Number System after scene is ready
  if (SceneManager.scene) {
    DamageNumberSystem.init(SceneManager.scene);
  } else {
    console.error("[Main-initializeGame] Cannot initialize DamageNumberSystem: Scene not ready.");
  }

  // 6. Start the game loop
  console.log("[Main] Initialization complete. Starting game loop.");
  lastTime = performance.now();
  requestAnimationFrame(gameLoop);
}


// Use an async function for onload to await initialization
window.onload = async () => {
  try {
    await initializeGame(); // Wait for all async setup to complete
    console.log("[Main] Initialization finished. Adding key listener.");

// Add 'L' key listener for leaderboard *after* successful initialization
document.addEventListener('keydown', (event) => {
  if (event.code === 'KeyL') {
    // Log the state of Leaderboard elements when 'L' is pressed for debugging
    console.log("[Main] 'L' key pressed. Checking Leaderboard state:",
      window.Leaderboard,
      window.Leaderboard?.elements?.container,
      window.Leaderboard?.elements?.list
    );

    // Check if Leaderboard object and its elements are initialized before toggling
    if (window.Leaderboard &&
        window.Leaderboard.elements.container &&
        window.Leaderboard.elements.list)
    {
      Leaderboard.toggle(Game.killLog);
    } else {
      // Log if the key is pressed but elements aren't ready
      console.warn("[Main] Leaderboard elements not ready when 'L' key was pressed.");
    }
  }
});
  } catch (error) {
    console.error("[Main] Critical error during game initialization:", error);
    // Optionally display an error message to the user
  }
};

// Export debug state for other modules
export const Debug = {
  state: debugState
};

// Make these available globally for cross-module access
window.Game = Game;
window.HUD = HUD;
window.Leaderboard = Leaderboard; // Make Leaderboard global
// window.AudioManager is assigned above after init

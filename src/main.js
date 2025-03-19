import { SceneManager } from './scene.js';
import { Game } from './game.js';
import { Network } from './network.js';
import * as THREE from 'three';

// Fixed timestep configuration
const TICK_RATE = 60; // Updates per second
const MS_PER_TICK = 1000 / TICK_RATE;
let lastTickTime = 0;
let accumulator = 0;

async function init() {
  SceneManager.init();
  Network.init();
  
  await Game.init(Network.socket);

  // Start the game loop with timestamp
  lastTickTime = performance.now();
  requestAnimationFrame(gameLoop);
}

function gameLoop(timestamp) {
  // Calculate time since last frame
  const deltaTime = timestamp - lastTickTime;
  lastTickTime = timestamp;
  
  // Add to the accumulator
  accumulator += deltaTime;
  
  // Run fixed updates at consistent intervals
  while (accumulator >= MS_PER_TICK) {
    fixedUpdate(MS_PER_TICK / 1000); // Convert to seconds
    accumulator -= MS_PER_TICK;
  }
  
  // Render at animation frame rate
  // The rendering interpolation factor could be accumulator / MS_PER_TICK
  // for smoother visuals, but we'll keep it simple for now
  SceneManager.render();
  
  // Continue the loop
  requestAnimationFrame(gameLoop);
}

function fixedUpdate(deltaTime) {
  let cameraForward = null;
  
  if (Game.player) {
    // Get camera direction for movement calculation
    cameraForward = SceneManager.updateCamera(
      Game.player.position, 
      Game.player.quaternion
    );
    
    // Process input and get movement delta
    const delta = Game.processInput(cameraForward, deltaTime);
    
    if (delta) {
      // Add rotation data from the camera
      const euler = new THREE.Euler().setFromQuaternion(Game.player.quaternion, 'YXZ');
      delta.rotation = euler.y;
      
      // Apply movement locally immediately
      Game.applyMovement(delta);
      
      // Send movement to server
      Network.sendMove(delta);
    }
    
    // Interpolate other players
    Game.interpolatePlayers();
  }
}

// Initialize the game when the window loads
window.onload = init;
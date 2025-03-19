import { SceneManager } from './scene.js';
import { Game } from './game.js';
import { Network } from './network.js';
import * as THREE from 'three';

async function init() {
  SceneManager.init();
  Network.init();
  
  await Game.init(Network.socket);
  
  // Start the game loop
  lastTime = performance.now();
  requestAnimationFrame(gameLoop);
}

let lastTime = 0;
let lastNetworkUpdate = 0;
const NETWORK_UPDATE_RATE = 100; // ms between network updates

function gameLoop(timestamp) {
  const deltaTime = (timestamp - lastTime) / 1000; // Convert to seconds
  lastTime = timestamp;
  
  // Update camera position based on player
  if (Game.player) {
    const cameraForward = SceneManager.updateCamera(Game.player.position);
    
    // Process player input and get movement data
    const moveData = Game.processInput(cameraForward, deltaTime);
    
    // Send position to server at a controlled rate
    if (moveData && timestamp - lastNetworkUpdate > NETWORK_UPDATE_RATE) {
      Network.sendMove(moveData);
      lastNetworkUpdate = timestamp;
    }
  }
  
  // Update animations
  Game.update(deltaTime);
  
  // Render the scene
  SceneManager.render();
  
  // Continue the game loop
  requestAnimationFrame(gameLoop);
}

window.onload = init;

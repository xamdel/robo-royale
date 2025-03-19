import { SceneManager } from './scene.js';
import { Game } from './game.js';
import { Network } from './network.js';
import * as THREE from 'three';

const TICK_RATE = 60;
const MS_PER_TICK = 1000 / TICK_RATE;
let lastTickTime = 0;
let accumulator = 0;

async function init() {
  SceneManager.init();
  Network.init();
  
  await Game.init(Network.socket);
  lastTickTime = performance.now();
  requestAnimationFrame(gameLoop);
}

function gameLoop(timestamp) {
  const deltaTime = timestamp - lastTickTime;
  lastTickTime = timestamp;
  
  accumulator += deltaTime;
  
  while (accumulator >= MS_PER_TICK) {
    fixedUpdate(MS_PER_TICK / 1000);
    accumulator -= MS_PER_TICK;
  }
  
  // Update animations with the full frame time for smooth playback
  Game.update(deltaTime / 1000); // Convert to seconds
  SceneManager.render();
  
  requestAnimationFrame(gameLoop);
}

function fixedUpdate(deltaTime) {
  let cameraForward = null;
  
  if (Game.player) {
    cameraForward = SceneManager.updateCamera(
      Game.player.position, 
      Game.player.quaternion
    );
    
    const delta = Game.processInput(cameraForward, deltaTime);
    
    if (delta) {
      const euler = new THREE.Euler().setFromQuaternion(Game.player.quaternion, 'YXZ');
      delta.rotation = euler.y;
      
      Game.applyMovement(delta);
      Network.sendMove(delta);
    }
    
    Game.interpolatePlayers();
  }
}

window.onload = init;
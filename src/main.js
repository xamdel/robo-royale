import { SceneManager } from './scene.js';
import { Game } from './game.js';
import { Network } from './network.js';

async function init() {
  SceneManager.init();
  Network.init();
  
  await Game.init(Network.socket);

  function animate() {
    requestAnimationFrame(animate);

    let cameraForward = null;
    if (Game.player) {
      cameraForward = SceneManager.updateCamera(Game.player.position, Game.player.quaternion);
    }

    const delta = Game.processInput(cameraForward);
    if (delta) {
      const euler = new THREE.Euler().setFromQuaternion(Game.player.quaternion, 'YXZ');
      delta.rotation = euler.y;
      // Process movement locally for responsiveness
      Game.player.position.lerp(Game.targetPosition, 0.25); // Apply movement locally at higher rate
      Network.sendMove(delta);
    }

    Game.interpolatePlayers();
    SceneManager.render();
  }
  animate();
}

window.onload = init;

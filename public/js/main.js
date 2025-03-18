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
      // Use the player’s current yaw (smoothed) for network sync
      const euler = new THREE.Euler().setFromQuaternion(Game.player.quaternion, 'YXZ');
      delta.rotation = euler.y;
      Network.sendMove(delta);
    }

    Game.interpolatePlayers();
    SceneManager.render();
  }
  animate();
}

window.onload = init;
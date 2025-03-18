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
      delta.rotation = SceneManager.cameraYaw + Math.PI; // Send adjusted yaw to server
      Network.sendMove(delta);
    }

    Game.interpolatePlayers();
    SceneManager.render();
  }
  animate();
}

window.onload = init;
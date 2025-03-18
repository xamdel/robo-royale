function init() {
  SceneManager.init();
  Network.init();
  Game.init(Network.socket);

  function animate() {
    requestAnimationFrame(animate);
    const delta = Game.processInput();
    if (delta) {
      Network.sendMove(delta);
    }
    Game.interpolatePlayers();
    SceneManager.render();
  }
  animate();
}

window.onload = init;
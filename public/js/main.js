async function init() {
  SceneManager.init();
  Network.init();
  
  // Wait for the game to initialize (including model loading)
  await Game.init(Network.socket);

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

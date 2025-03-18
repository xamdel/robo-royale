const Network = {
  socket: io(),

  init() {
    this.socket.on('connect', () => {
      console.log('Connected to server');
    });

    this.socket.on('existingPlayers', (serverPlayers) => {
      for (let id in serverPlayers) {
        if (id !== this.socket.id) {
          this.addOtherPlayer(id, serverPlayers[id].position);
        } else {
          Game.player.position.set(
            serverPlayers[id].position.x,
            serverPlayers[id].position.y,
            serverPlayers[id].position.z
          );
        }
      }
    });

    this.socket.on('newPlayer', (player) => {
      if (player.id !== this.socket.id) {
        this.addOtherPlayer(player.id, player.position);
      }
    });

    this.socket.on('playerMoved', (data) => {
      if (Game.otherPlayers[data.id]) {
        Game.otherPlayers[data.id].lastPosition.copy(Game.otherPlayers[data.id].mesh.position);
        Game.otherPlayers[data.id].targetPosition.set(
          data.position.x,
          data.position.y,
          data.position.z
        );
      }
    });

    this.socket.on('playerDisconnected', (id) => {
      if (Game.otherPlayers[id]) {
        SceneManager.remove(Game.otherPlayers[id].mesh);
        delete Game.otherPlayers[id];
      }
    });
  },

  addOtherPlayer(id, position) {
    Game.otherPlayers[id] = Game.createPlayerMesh(id);
    SceneManager.add(Game.otherPlayers[id].mesh);
    Game.otherPlayers[id].targetPosition.set(position.x, position.y, position.z);
    Game.otherPlayers[id].lastPosition.copy(Game.otherPlayers[id].targetPosition);
  },

  sendMove(delta) {
    this.socket.emit('move', { delta: delta });
  }
};
import { io } from 'socket.io-client';

export const Network = {
  socket: io(),
  lastMoveSent: 0,

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
        
        // Update rotation if provided
        if (data.rotation !== undefined) {
          // Apply the rotation to the player model
          Game.otherPlayers[data.id].mesh.rotation.y = data.rotation;
          
          // Create a quaternion for the rotation around the Y axis
          const targetQuaternion = new THREE.Quaternion();
          targetQuaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), data.rotation);
          
          // Apply the quaternion to the player mesh
          Game.otherPlayers[data.id].mesh.quaternion.copy(targetQuaternion);
        }
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
    const now = performance.now();
    // Throttle movement packets to a maximum of 20 per second (50ms minimum gap)
    if (now - this.lastMoveSent > 50) {
      this.socket.emit('move', { delta: delta });
      this.lastMoveSent = now;
    }
  }
};

class Player {
  constructor(socketId) {
    this.id = socketId;
    this.position = { x: 0, y: 0, z: 0 };
    this.rotation = { x: 0, y: 0, z: 0, w: 1 };
    this.lastProcessedInput = 0;
    this.lastActive = Date.now();
    this.lastUpdateTime = Date.now();
    this.moveState = {
      moveForward: false,
      moveBackward: false,
      moveLeft: false,
      moveRight: false,
      isRunning: false
    };
  }

  updatePosition(positionData, inputId) {
    this.position = positionData.position;
    this.rotation = positionData.rotation;
    this.lastProcessedInput = inputId;
    this.lastActive = Date.now();
    this.lastUpdateTime = Date.now();
    
    // Update movement state
    this.moveState = {
      moveForward: positionData.input.moveForward,
      moveBackward: positionData.input.moveBackward,
      moveLeft: positionData.input.moveLeft,
      moveRight: positionData.input.moveRight,
      isRunning: positionData.input.isRunning
    };
  }

  toJSON() {
    return {
      id: this.id,
      position: this.position,
      rotation: this.rotation,
      lastProcessedInput: this.lastProcessedInput,
      moveState: this.moveState,
      timestamp: Date.now(),
      timeSinceLastUpdate: Date.now() - this.lastUpdateTime
    };
  }
}

class PlayerManager {
  constructor() {
    this.players = new Map();
  }

  addPlayer(socketId) {
    const player = new Player(socketId);
    this.players.set(socketId, player);
    return player;
  }

  getPlayer(socketId) {
    return this.players.get(socketId);
  }

  removePlayer(socketId) {
    this.players.delete(socketId);
  }

  getAllPlayers() {
    return Array.from(this.players.values());
  }

  getPlayerCount() {
    return this.players.size;
  }
}

module.exports = {
  Player,
  PlayerManager
};

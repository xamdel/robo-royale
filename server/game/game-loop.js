const gameConfig = require('../config/game-config');

class GameLoop {
  constructor(io, playerManager, projectileManager) {
    this.io = io;
    this.playerManager = playerManager;
    this.projectileManager = projectileManager;
    this.projectileController = null;
    this.moveRateLimit = new Map();
  }

  start() {
    // Start the game loop at the configured tick rate
    this.intervalId = setInterval(() => {
      this.update();
    }, 1000 / gameConfig.TICK_RATE);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }

  update() {
    const now = Date.now();

    // Remove inactive players
    this.cleanupInactivePlayers(now);

    // Update projectiles and get updated positions
    const updatedProjectiles = this.projectileController.update(1 / gameConfig.TICK_RATE);

    // Prepare game state update
    const gameState = this.prepareGameState(now, updatedProjectiles);

    // Broadcast game state to all clients
    this.io.emit('gameState', gameState);
  }

  cleanupInactivePlayers(currentTime) {
    const players = this.playerManager.getAllPlayers();
    
    players.forEach(player => {
      if (currentTime - player.lastActive > gameConfig.INACTIVE_TIMEOUT) {
        console.log(`Removing inactive player: ${player.id}`);
        this.playerManager.removePlayer(player.id);
        this.io.emit('playerLeft', player.id);
        this.moveRateLimit.delete(player.id);
      }
    });
  }

  prepareGameState(currentTime, updatedProjectiles) {
    const gameState = {
      timestamp: currentTime,
      players: this.playerManager.getAllPlayers().map(player => player.toJSON())
    };

    // Add projectile updates if any exist
    if (updatedProjectiles && updatedProjectiles.length > 0) {
      gameState.projectiles = updatedProjectiles;
    }

    return gameState;
  }

  checkMoveRateLimit(socketId) {
    const now = Date.now();
    const lastMove = this.moveRateLimit.get(socketId) || 0;
    
    if (now - lastMove < gameConfig.MIN_MOVE_INTERVAL) {
      return false;
    }
    
    this.moveRateLimit.set(socketId, now);
    return true;
  }
}

module.exports = GameLoop;

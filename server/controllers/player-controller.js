const { PlayerManager } = require('../models/player');
const ValidationService = require('../services/validation');
const gameConfig = require('../config/game-config');

class PlayerController {
  constructor(io, gameLoop) {
    this.io = io;
    this.gameLoop = gameLoop;
    this.playerManager = new PlayerManager();
  }

  handleConnection(socket) {
    console.log(`Player connected: ${socket.id}`);

    // Reject if server full
    if (this.playerManager.getPlayerCount() >= gameConfig.MAX_PLAYERS) {
      console.log('Server full, rejecting connection');
      socket.disconnect();
      return;
    }

    // Initialize player
    const player = this.playerManager.addPlayer(socket.id);

    // Send initial state to new player
    socket.emit('gameState', {
      timestamp: Date.now(),
      players: this.playerManager.getAllPlayers().map(p => p.toJSON())
    });

    // Setup socket event handlers
    this.setupMoveHandler(socket, player);
    this.setupDisconnectHandler(socket);

    return player;
  }

  setupMoveHandler(socket, player) {
    socket.on('move', (data) => {
      // Rate limiting
      if (!this.gameLoop.checkMoveRateLimit(socket.id)) return;

      // Validate data
      if (!ValidationService.isValidMoveData(data)) {
        console.warn(`Invalid move data from ${socket.id}`);
        return;
      }

      // Validate movement
      if (ValidationService.isValidMovement(player.position, data.position)) {
        player.updatePosition(data, data.inputId);
      } else {
        // If invalid movement, force client position reset
        socket.emit('positionCorrection', {
          position: player.position,
          rotation: player.rotation
        });
      }
    });
    
    // Handle request for full game state (used after respawn)
    socket.on('requestGameState', () => {
      console.log(`Player ${socket.id} requested full game state refresh`);
      // Send current game state to the player
      socket.emit('gameState', {
        timestamp: Date.now(),
        players: this.playerManager.getAllPlayers().map(p => p.toJSON())
      });
    });
  }

  setupDisconnectHandler(socket) {
    socket.on('disconnect', () => {
      console.log(`Player disconnected: ${socket.id}`);
      this.playerManager.removePlayer(socket.id);
      this.io.emit('playerLeft', socket.id);
    });
  }

  getPlayerManager() {
    return this.playerManager;
  }
}

module.exports = PlayerController;

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

      // Validate movement using the collision service
      const isValid = ValidationService.isValidMovement(player.position, data.position);
      // Retrieve the corrected position calculated by the collision service
      // Refined approach: Pass socket.id to store/retrieve result
      ValidationService.instance.lastValidationResult.set(socket.id, ValidationService.instance.lastValidationResult.get('lastResult')); // Associate with player
      const validationResult = ValidationService.instance.lastValidationResult.get(socket.id);
      const correctedPos = validationResult ? validationResult.correctedPos : null;


      if (isValid && correctedPos) {
        // Update server state with the *corrected* position
        const updateData = {
          ...data,
          position: correctedPos // Use the server-validated position
        };
        player.updatePosition(updateData, data.inputId);

        // Server Reconciliation: Check if client position deviates significantly
        const clientPos = data.position;
        const serverPos = correctedPos;
        const distanceThreshold = 0.1; // Allow small discrepancies

        // Basic distance check for reconciliation
        const dx = clientPos.x - serverPos.x;
        const dy = clientPos.y - serverPos.y;
        const dz = clientPos.z - serverPos.z;
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (distance > distanceThreshold) {
          console.log(`Correcting position for ${socket.id}. Client: ${JSON.stringify(clientPos)}, Server: ${JSON.stringify(serverPos)}, Dist: ${distance.toFixed(3)}`);
          socket.emit('positionCorrection', {
            position: serverPos, // Send the corrected server position
            rotation: player.rotation // Keep client rotation for now
          });
        }

      } else {
        // If movement is invalid according to collision service, force client position reset
        console.log(`Invalid move detected for ${socket.id}. Resetting position.`);
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

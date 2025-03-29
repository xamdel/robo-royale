const { PlayerManager } = require('../models/player');
const ValidationService = require('../services/validation');
const gameConfig = require('../config/game-config');

class PlayerController {
  constructor(io, gameLoop) {
    this.io = io;
    this.gameLoop = gameLoop;
    this.playerManager = new PlayerManager();
    this.weaponController = null; // Initialize weaponController reference
  }

  // Setter for WeaponController dependency (called from server/index.js)
  setWeaponController(weaponController) {
    this.weaponController = weaponController;
    console.log("WeaponController set in PlayerController");
  }

  handleConnection(socket) {
    console.log(`Player connected: ${socket.id}`);

    // Reject if server full
    if (this.playerManager.getPlayerCount() >= gameConfig.MAX_PLAYERS) {
      console.log('Server full, rejecting connection');
      socket.disconnect();
      return;
    }

    // Generate a simple name for the player
    const playerName = `Player_${socket.id.slice(-4)}`; 
    console.log(`Assigning name "${playerName}" to player ${socket.id}`);

    // Initialize player with the generated name
    const player = this.playerManager.addPlayer(socket.id, playerName);

    // Send initial state to new player
    socket.emit('gameState', {
      timestamp: Date.now(),
      players: this.playerManager.getAllPlayers().map(p => p.toJSON())
    });

    // Setup socket event handlers
    this.setupMoveHandler(socket, player);
    this.setupDeathHandler(socket, player); // Add death handler setup
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

  setupDeathHandler(socket, player) {
    socket.on('playerDeath', (data) => {
      // Basic validation (can be expanded)
      if (!player || player.isDead) {
        console.warn(`Received playerDeath event from already dead or non-existent player: ${socket.id}`);
        return;
      }
      
      console.log(`Received playerDeath event from ${socket.id}. Killer: ${data?.killerId || 'Unknown'}`);
      
      // Mark player as dead (server-side) using the correct method
      // Note: player.die() is likely already called when the fatal hit was processed.
      // Calling it again might be redundant but shouldn't hurt.
      // player.die(); // Consider removing if redundant

      // Weapon dropping logic is now handled authoritatively in ProjectileController.handlePlayerKilled
      // when the fatal hit is detected. This handler is now primarily for logging or potential future client-specific death logic.
      
      console.log(`[PlayerController] Received playerDeath event for ${socket.id}. Weapon dropping handled by ProjectileController.`);
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

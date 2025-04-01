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
    this.setupCustomizationHandler(socket, player); // Add customization handler
    this.setupTurretTeleportHandler(socket, player); // Add teleport handler
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

      // Validate movement, skipping check if player just teleported
      let movementIsValid = false;
      if (player.justTeleported) {
        console.log(`[PlayerController] Player ${socket.id} just teleported, skipping movement validation for this update.`);
        movementIsValid = true;
        player.justTeleported = false; // Reset the flag after allowing one update
      } else {
        movementIsValid = ValidationService.isValidMovement(player.position, data.position);
      }

      if (movementIsValid) {
        player.updatePosition(data, data.inputId);
      } else {
        console.warn(`[PlayerController] Invalid movement detected for ${socket.id}. Old: ${JSON.stringify(player.position)}, New: ${JSON.stringify(data.position)}`);
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

  setupCustomizationHandler(socket, player) {
    socket.on('playerCustomization', (data) => {
      if (!player) return; // Player might have disconnected

      // Validate received data
      let updated = false;
      if (data && typeof data.primary === 'string' && /^#[0-9A-F]{6}$/i.test(data.primary)) {
        if (player.primaryColor !== data.primary) {
          console.log(`[PlayerController] Updating primary color for ${socket.id}: ${data.primary}`);
          player.primaryColor = data.primary;
          updated = true;
        }
      } else {
         console.warn(`[PlayerController] Invalid primary color received from ${socket.id}:`, data?.primary);
      }

      if (data && typeof data.name === 'string' && data.name.trim().length > 0 && data.name.trim().length <= 16) {
         const newName = data.name.trim();
         if (player.name !== newName) {
            console.log(`[PlayerController] Updating name for ${socket.id}: "${newName}"`);
            player.name = newName; // Update the player's name
            updated = true;
         }
      } else {
         console.warn(`[PlayerController] Invalid name received from ${socket.id}:`, data?.name);
      }

      // The updated name and color will be sent out in the next gameState broadcast.
      if (updated) {
         console.log(`[PlayerController] Player ${socket.id} updated. New state: Name="${player.name}", Color=${player.primaryColor}`);
      }
    });
  }

  setupDisconnectHandler(socket) {
    socket.on('disconnect', () => {
      console.log(`Player disconnected: ${socket.id}`);
      this.playerManager.removePlayer(socket.id);
      this.io.emit('playerLeft', socket.id);
    });
  }

  setupTurretTeleportHandler(socket, player) {
    socket.on('turretTeleportRequest', (data) => {
      if (!player || player.isDead) {
        console.warn(`[PlayerController] Received turretTeleportRequest from dead or non-existent player: ${socket.id}`);
        return;
      }

      // Validate target position data
      if (!data || typeof data.position?.x !== 'number' || typeof data.position?.y !== 'number' || typeof data.position?.z !== 'number') {
        console.warn(`[PlayerController] Invalid teleport position data from ${socket.id}:`, data);
        return;
      }

      // TODO: Add server-side validation?
      // - Was the player actually in the turret recently? (Requires tracking turret state server-side)
      // - Is the target position valid (e.g., not inside a building)? (Requires collision checks)
      // For now, we trust the client's hit detection.

      const targetPos = data.position;
      // Add a small vertical offset to prevent falling through terrain
      const finalY = targetPos.y + 2.0; // Adjust offset as needed

      console.log(`[PlayerController] Teleporting player ${socket.id} to ${targetPos.x}, ${finalY}, ${targetPos.z}`);

      // Update player position directly
      player.position.x = targetPos.x;
      player.position.y = finalY;
      player.position.z = targetPos.z;
      player.justTeleported = true; // Set the flag

      // Reset player velocity/movement state if applicable
      player.velocity = { x: 0, y: 0, z: 0 };
      player.moveState = { moveForward: false, moveBackward: false, moveLeft: false, moveRight: false };

      // Emit confirmation back to the client
      socket.emit('turretTeleportComplete', {
        position: { x: targetPos.x, y: finalY, z: targetPos.z }
      });
      console.log(`[PlayerController] Sent turretTeleportComplete to ${socket.id}`);

      // The game loop will broadcast the new position in the next gameState update.
    });
  }

  getPlayerManager() {
    return this.playerManager;
  }
}

module.exports = PlayerController;

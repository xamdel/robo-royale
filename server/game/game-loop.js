const gameConfig = require('../config/game-config');
// Import the entire module first
const collisionModule = require('./server-collision');
// Access the class from the imported module
const ServerCollisionSystem = collisionModule.ServerCollisionSystem;

class GameLoop {
  constructor(io, playerManager, projectileManager) {
    this.io = io;
    this.playerManager = playerManager;
    this.projectileManager = projectileManager;
    this.projectileController = null; // Will be set by server/index.js
    this.collisionSystem = new ServerCollisionSystem(
        gameConfig.WORLD_WIDTH || 600, // Get dimensions from config or use defaults
        gameConfig.WORLD_DEPTH || 600
        // Add cellSize if needed
    );
    this.moveRateLimit = new Map();
    this.droppedItems = new Map(); // Map<string, {id: string, type: string, position: object}>
    this.pickupIdCounter = 0; // Simple counter for unique pickup IDs

    // TODO: Populate the collision system with static environment data
    this.populateCollisionSystem();
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

    // Update projectiles (ProjectileController should handle its own collisions using this.collisionSystem.raycast)
    const updatedProjectiles = this.projectileController.update(1 / gameConfig.TICK_RATE, this.collisionSystem);

    // --- Player Movement Collision (Conceptual - Actual logic might be in PlayerController/Manager) ---
    // This part needs to happen where player positions are authoritatively updated based on input.
    // Example: Inside a PlayerManager.updatePlayerPosition(playerId, desiredPosition) method
    /*
    const player = this.playerManager.getPlayer(playerId);
    if (player) {
        const originalPosition = player.position.clone(); // Use server-side Vec3
        const desiredPosition = calculateDesiredPositionBasedOnInput(player, inputData); // Server-side Vec3

        // Check for collisions
        const collisions = this.collisionSystem.checkPlayerCollision(desiredPosition, player.radius);

        // Resolve collisions (modifies desiredPosition)
        if (collisions.length > 0) {
            this.collisionSystem.resolvePlayerCollision(originalPosition, desiredPosition, player.radius, collisions);
        }

        // Set final authoritative position
        player.setPosition(desiredPosition);

        // Adjust height based on terrain (server needs terrain height data)
        // player.position.y = this.getTerrainHeightAt(player.position.x, player.position.z);
    }
    */
    // --- End Conceptual Player Movement Collision ---


    // Prepare game state update
    const gameState = this.prepareGameState(now, updatedProjectiles);

    // Broadcast game state to all clients
    this.io.emit('gameState', gameState);

    // Check for player respawns
    this.checkPlayerRespawns();
  }

  checkPlayerRespawns() {
    const playersToRespawn = this.playerManager.getAllPlayers().filter(p => p.isDead && p.checkRespawn());
    playersToRespawn.forEach(player => {
      console.log(`Player ${player.id} is respawning.`);
      // Broadcast respawn event with flag to clear weapons
      this.io.emit('playerRespawned', {
        playerId: player.id,
        position: player.position, // Send initial respawn position
        clearWeapons: true // Add flag to signal weapon clearing
      });
    });
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
      players: this.playerManager.getAllPlayers().map(player => player.toJSON()),
      // Include active dropped items in the game state
      droppedItems: Array.from(this.droppedItems.values()) 
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

  // Creates a dropped weapon pickup item in the world state
  createDroppedWeaponPickup(weaponType, position) {
    const pickupId = `pickup_${this.pickupIdCounter++}`;
    const itemData = {
      id: pickupId,
      type: weaponType,
      position: { x: position.x, y: position.y, z: position.z } // Store plain object
    };
    this.droppedItems.set(pickupId, itemData);
    console.log(`[GameLoop] Created dropped weapon pickup: ID=${pickupId}, Type=${weaponType}, Pos=`, itemData.position);
    
    // TODO: Add logic for item despawn timer if needed
    
    return itemData; // Return the created item data including its ID
  }

  // Removes a dropped weapon pickup item from the world state
  removeDroppedWeaponPickup(pickupId) {
    const removed = this.droppedItems.delete(pickupId);
    if (removed) {
      console.log(`[GameLoop] Removed dropped weapon pickup: ID=${pickupId}`);
      // Broadcast removal to clients
      this.io.emit('droppedWeaponRemoved', { pickupId: pickupId });
    } else {
      console.warn(`[GameLoop] Tried to remove non-existent dropped pickup: ID=${pickupId}`);
    }
    return removed;
  }

  // Placeholder for populating the collision system
  populateCollisionSystem() {
      console.log("[GameLoop] Populating ServerCollisionSystem...");
      // TODO: Load or generate static collider data (trees, rocks, buildings)
      // This data needs positions and dimensions matching the client generation.
      // Example:
      // const treeData = { position: {x: 10, y: 0, z: 5}, radius: 0.5, height: 8 };
      // this.collisionSystem.registerCollider(treeData, 'tree');
      // ... repeat for all static objects ...
      console.log("[GameLoop] ServerCollisionSystem population placeholder complete.");
  }
}

module.exports = GameLoop;

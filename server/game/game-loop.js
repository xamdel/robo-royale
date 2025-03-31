const gameConfig = require('../config/game-config');
// Removed TerrainGenerator and weaponConfigs imports to avoid module conflicts

// Constants for spawning
const TOTAL_SPAWNS = 100; // Total number of items (weapons + ammo)
const MAP_WIDTH = 600;
const MAP_HEIGHT = 600; // Corrected variable name
const VERTICAL_OFFSET = 1.0; // How high above terrain to spawn

class GameLoop {
  constructor(io, playerManager, projectileManager) {
    this.io = io;
    this.playerManager = playerManager;
    this.projectileManager = projectileManager;
    this.projectileController = null; // Will be set by server/index.js
    this.moveRateLimit = new Map();
    this.pickupItems = new Map(); // Map<string, {id: string, type: 'weapon'|'ammo', weaponType?: string, position: object}> - Holds ALL active pickups
    this.pickupIdCounter = 0; // Simple counter for unique pickup IDs
    this.mapSeed = gameConfig.MAP_SEED || `seed_${Date.now()}`; // Use config or generate
    // Server no longer needs to initialize TerrainGenerator

    // Generate initial weapon/ammo spawns
    this._initializePickupItems();
  }

  // Generates the initial set of weapon and ammo pickups
  _initializePickupItems() {
    console.log(`[GameLoop] Generating ${TOTAL_SPAWNS} initial pickup items...`);
    this.pickupItems.clear(); // Ensure map is empty
    // Define weapon types directly here to avoid import issues
    const availableWeaponTypes = ['cannon', 'rocketLauncher', 'gatling'];

    if (availableWeaponTypes.length === 0) {
        console.error("[GameLoop] No weapon types defined locally. Cannot spawn weapon pickups.");
        // Spawn only ammo boxes? Or stop? For now, continue with ammo potentially.
    }

    for (let i = 0; i < TOTAL_SPAWNS; i++) {
        const pickupId = `item_${this.pickupIdCounter++}`;
        let itemData = null;

        // Randomly decide between weapon and ammo (approx 50/50)
        const isWeapon = Math.random() < 0.5 && availableWeaponTypes.length > 0;

        // Generate random position within map bounds
        const x = (Math.random() - 0.5) * MAP_WIDTH;
        const z = (Math.random() - 0.5) * MAP_HEIGHT; // Use MAP_HEIGHT

        // Server only generates X, Z. Client will calculate Y.
        const position = { x, y: 0, z }; // Set Y to 0 initially

        if (isWeapon) {
            // Select a random weapon type
            const weaponType = availableWeaponTypes[Math.floor(Math.random() * availableWeaponTypes.length)];
            itemData = {
                id: pickupId,
                type: 'weapon',
                weaponType: weaponType,
                position: position
            };
            // console.log(`[GameLoop] Generated WEAPON: ${weaponType} (ID: ${pickupId}) at`, position);
        } else {
            // Create ammo box data
            itemData = {
                id: pickupId,
                type: 'ammo',
                position: position
            };
            // console.log(`[GameLoop] Generated AMMO (ID: ${pickupId}) at`, position);
        }

        this.pickupItems.set(pickupId, itemData);
    }
    console.log(`[GameLoop] Finished generating initial pickups. Total: ${this.pickupItems.size}`);
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

    // Check for player respawns
    this.checkPlayerRespawns();
  }

  checkPlayerRespawns() {
    const playersToRespawn = this.playerManager.getAllPlayers().filter(p => p.isDead && p.checkRespawn());
    playersToRespawn.forEach(player => {
      console.log(`Player ${player.id} is respawning.`);
      // Broadcast respawn event including colors and flag to clear weapons
      this.io.emit('playerRespawned', {
        playerId: player.id,
        position: player.position, // Send initial respawn position
        primaryColor: player.primaryColor, // Include primary color
        // secondaryColor: player.secondaryColor, // Removed secondary color
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
      // Include ALL active pickup items (initial spawns + dropped)
      pickupItems: Array.from(this.pickupItems.values())
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

  // Get data for a specific pickup item
  getPickupItem(pickupId) {
    return this.pickupItems.get(pickupId);
  }

  // Creates a dropped weapon pickup item and adds it to the main pickupItems map
  createDroppedWeaponPickup(weaponType, position) {
    const pickupId = `pickup_${this.pickupIdCounter++}`; // Distinguish dropped items by prefix
    const itemData = {
      id: pickupId,
      type: 'weapon', // Explicitly set type
      weaponType: weaponType, // Store the weapon type
      position: { x: position.x, y: 0, z: position.z } // Store only X, Z. Client calculates Y.
    };
    this.pickupItems.set(pickupId, itemData); // Add to the main map
    console.log(`[GameLoop] Created dropped WEAPON pickup state: ID=${pickupId}, Type=${weaponType}, Pos=`, {x: itemData.position.x, z: itemData.position.z});

    // TODO: Add logic for item despawn timer if needed

    // Return the created item data including its ID
    // The caller (WeaponController) will broadcast 'droppedWeaponCreated'
    return itemData;
  }

  // Removes any pickup item (initial spawn or dropped) from the world state
  removePickupItem(pickupId) {
    const item = this.pickupItems.get(pickupId);
    if (!item) {
      console.warn(`[GameLoop] Tried to remove non-existent pickup item: ID=${pickupId}`);
      return false;
    }

    const removed = this.pickupItems.delete(pickupId);
    if (removed) {
      console.log(`[GameLoop] Removed pickup item: ID=${pickupId}, Type=${item.type}`);
      // Broadcast removal to clients, indicating the type removed
      this.io.emit('pickupRemoved', { pickupId: pickupId, type: item.type });
    }
    return removed;
  }

  // Method to get the initial state of all pickups (for new connections)
  getInitialPickupState() {
    return Array.from(this.pickupItems.values());
  }
}

module.exports = GameLoop;

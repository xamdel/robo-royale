const ValidationService = require('../services/validation');
const gameConfig = require('../config/game-config');

// Map client mount IDs (logical names) to server socket/bone names
const mountIdToSocketName = {
  'rightArm': 'ArmR',
  'leftArm': 'ArmL',
  'rightShoulder': 'ShoulderR',
  'leftShoulder': 'ShoulderL'
  // Add other mappings if necessary (e.g., back mounts)
};

class WeaponController {
  constructor(io, playerManager, gameLoop) { // Add gameLoop parameter
    this.io = io;
    this.playerManager = playerManager;
    this.gameLoop = gameLoop; // Store gameLoop reference
    this.playerWeapons = new Map(); // Track which weapons each player has
    this.weaponCooldowns = new Map(); // Track weapon cooldowns
    this.playerAmmo = new Map(); // Track ammo for each player's weapons
  }

  setupSocketHandlers(socket) {
    socket.on('weaponPickup', (data) => this.handleWeaponPickup(socket, data)); // Handles picking up spawned weapons
    socket.on('pickupCollected', (data) => this.handlePickupCollected(socket, data)); // Handles picking up dropped items
    socket.on('weaponDrop', (data) => this.handleWeaponDrop(socket, data)); // Manual drop? (Not currently used for death)
    socket.on('weaponSwitch', (data) => this.handleWeaponSwitch(socket, data));
    socket.on('requestPlayerWeapons', (data) => this.handlePlayerWeaponsRequest(socket, data));
  }

  handlePlayerWeaponsRequest(socket, data) {
    // Validate request data
    if (!data || !data.playerId) {
      console.warn(`Invalid player weapons request from ${socket.id}`);
      return;
    }

    const targetPlayerId = data.playerId;
    const playerWeapons = this.playerWeapons.get(targetPlayerId);
    
    if (!playerWeapons || playerWeapons.size === 0) {
      console.log(`No weapons found for player ${targetPlayerId}`);
      return;
    }

    // Send each weapon to the requesting client
    Array.from(playerWeapons).forEach(weapon => {
      socket.emit('weaponPickedUp', {
        weaponId: weapon.id,
        weaponType: weapon.type,
        socketName: weapon.socket,
        playerId: targetPlayerId
      });
    });
    
    console.log(`Sent ${playerWeapons.size} weapons for player ${targetPlayerId} to ${socket.id}`);
  }

  handleWeaponPickup(socket, data) {
    // Validate weapon pickup data
    if (!ValidationService.isValidWeaponPickupData(data)) {
      console.warn(`Invalid weapon pickup data from ${socket.id}`, data);
      return;
    }

    // Initialize player's weapons if needed
    if (!this.playerWeapons.has(socket.id)) {
      this.playerWeapons.set(socket.id, new Set());
    }

    // Add weapon to player's inventory
    const playerWeapons = this.playerWeapons.get(socket.id);
    playerWeapons.add({
      id: data.weaponId,
      type: data.weaponType,
      socket: data.socketName
    });

    // Initialize weapon cooldown
    if (!this.weaponCooldowns.has(socket.id)) {
      this.weaponCooldowns.set(socket.id, new Map());
    }
    this.weaponCooldowns.get(socket.id).set(data.weaponId, 0);

    // Initialize ammo for the weapon
    if (!this.playerAmmo.has(socket.id)) {
      this.playerAmmo.set(socket.id, new Map());
    }
    // Get initial ammo using validation service
    const initialAmmo = ValidationService.getInitialAmmo(data.weaponType);
    this.playerAmmo.get(socket.id).set(data.weaponId, initialAmmo);

    // Send initial ammo count to the player
    socket.emit('ammoUpdate', {
      weaponId: data.weaponId,
      ammo: initialAmmo
    });

    // Broadcast pickup to all players except the one who picked it up
    socket.broadcast.emit('weaponPickedUp', {
      weaponId: data.weaponId,
      weaponType: data.weaponType,
      socketName: data.socketName,
      playerId: socket.id
    });
  }

  // Handles the 'weaponDrop' event from the client (e.g., during context menu swap)
  handleWeaponDrop(socket, data) {
    // Validate data
    if (!data || !data.mountId || !data.weaponType || !data.position) {
      console.warn(`[WeaponController] Invalid weaponDrop data from ${socket.id}:`, data);
      return;
    }

    console.log(`[WeaponController] Received weaponDrop event from ${socket.id} for mount ${data.mountId}`);

    // Find the weapon associated with this mount for the player
    const playerWeapons = this.playerWeapons.get(socket.id);
    let weaponToDropData = null;
    if (playerWeapons) {
      // Client sends mountId (e.g., 'leftArm'), server stores weapon data with socket name (e.g., 'ArmL').
      // Map the client's mountId to the server's socket name.
      const clientMountId = data.mountId;
      const socketNameToFind = mountIdToSocketName[clientMountId];

      if (!socketNameToFind) {
        console.error(`[WeaponController] Invalid mountId received from client ${socket.id}: ${clientMountId}`);
        return; // Exit if the mountId is not recognized
      }

      // Find the weapon whose 'socket' property matches the mapped socket name.
      weaponToDropData = Array.from(playerWeapons).find(w => w.socket === socketNameToFind);

      if (weaponToDropData) {
        console.log(`[WeaponController] Found weapon ${weaponToDropData.id} (${weaponToDropData.type}) on socket ${socketNameToFind} (from mount ${clientMountId}) to drop.`);
      } else {
        // Log available weapons and their sockets for debugging if not found
        console.warn(`[WeaponController] Could not find weapon on socket ${socketNameToFind} (from mount ${clientMountId}) for player ${socket.id}. Available weapons:`,
          Array.from(playerWeapons).map(w => ({ id: w.id, type: w.type, socket: w.socket }))
        );
      }
    }

    if (!weaponToDropData) {
      console.warn(`[WeaponController] Could not find weapon data for player ${socket.id} corresponding to drop request:`, data);
      return;
    }
    
    // Use the reusable drop function
    this._dropSingleWeapon(socket.id, weaponToDropData, data.position);
  }

  handleWeaponSwitch(socket, data) {
    const playerWeapons = this.playerWeapons.get(socket.id);
    if (!playerWeapons) return;

    // Validate player has the weapon
    const hasWeapon = Array.from(playerWeapons).some(w => w.id === data.weaponId);
    if (!hasWeapon) {
      console.warn(`Player ${socket.id} tried to switch to unowned weapon ${data.weaponId}`);
      return;
    }

    // Broadcast weapon switch
    this.io.emit('weaponSwitched', {
      playerId: socket.id,
      weaponId: data.weaponId
    });
  }

  canPlayerShoot(socketId, weaponId) {
    const playerWeapons = this.playerWeapons.get(socketId);
    if (!playerWeapons) return false;

    // Find the weapon in player's inventory
    const weapon = Array.from(playerWeapons).find(w => w.id === weaponId);
    if (!weapon) return false;

    const cooldowns = this.weaponCooldowns.get(socketId);
    if (!cooldowns) return false;

    // Check ammo
    const ammo = this.playerAmmo.get(socketId)?.get(weaponId);
    if (ammo === undefined || ammo <= 0) {
      return false;
    }

    const lastFireTime = cooldowns.get(weaponId) || 0;
    const now = Date.now();
    
    // Get weapon-specific cooldown
    const cooldownTime = gameConfig.WEAPON_COOLDOWN[weapon.type] || 
                        gameConfig.WEAPON_COOLDOWN.default;
    
    // Check if enough time has passed since last shot
    if (now - lastFireTime < cooldownTime) {
      return false;
    }

    // Update last fire time and decrease ammo
    cooldowns.set(weaponId, now);
    this.playerAmmo.get(socketId).set(weaponId, ammo - 1);

    // Notify client of ammo update
    this.io.to(socketId).emit('ammoUpdate', {
      weaponId: weaponId,
      ammo: ammo - 1
    });

    return true;
  }

  getWeaponType(socketId, weaponId) {
    const playerWeapons = this.playerWeapons.get(socketId);
    if (!playerWeapons) return 'default';

    const weapon = Array.from(playerWeapons).find(w => w.id === weaponId);
    
    // If no weapon found, return default
    if (!weapon) return 'default';
    
    // For clarity, map rocketLauncher to rocket projectile type consistently
    // This ensures all rocket weapons use the same projectile behavior
    return weapon.type;
  }

  // --- Internal Reusable Drop Logic ---
  _dropSingleWeapon(socketId, weaponData, dropPosition) {
    if (!weaponData || !weaponData.id || !weaponData.type) {
      console.error(`[WeaponController._dropSingleWeapon] Invalid weaponData for player ${socketId}:`, weaponData);
      return false;
    }
    
    const weaponId = weaponData.id;
    const weaponType = weaponData.type;
    
    console.log(`[WeaponController._dropSingleWeapon] Dropping weapon ${weaponId} (${weaponType}) for player ${socketId} at`, dropPosition);

    // 1. Remove from player's state
    const playerWeapons = this.playerWeapons.get(socketId);
    let removedFromSet = false;
    if (playerWeapons) {
      // Find the specific weapon object in the set to remove it
      const weaponToRemove = Array.from(playerWeapons).find(w => w.id === weaponId);
      if (weaponToRemove) {
        removedFromSet = playerWeapons.delete(weaponToRemove);
      }
    }
    const cooldownsRemoved = this.weaponCooldowns.get(socketId)?.delete(weaponId);
    const ammoRemoved = this.playerAmmo.get(socketId)?.delete(weaponId);

    if (!removedFromSet) {
        console.warn(`[WeaponController._dropSingleWeapon] Weapon ${weaponId} not found in player ${socketId}'s weapon set.`);
        // Continue anyway to ensure cooldown/ammo are cleared if they exist
    }

    // 2. Create dropped item state via GameLoop
    if (this.gameLoop) {
      const pickupData = this.gameLoop.createDroppedWeaponPickup(weaponType, dropPosition);
      if (pickupData) {
        // 3. Broadcast creation to all clients
        console.log(`[WeaponController._dropSingleWeapon] Broadcasting droppedWeaponCreated: ID=${pickupData.id}, Type=${pickupData.type}`);
        this.io.emit('droppedWeaponCreated', pickupData);
        return true; // Indicate successful drop and broadcast
      } else {
        console.error(`[WeaponController._dropSingleWeapon] Failed to create server-side state via gameLoop.createDroppedWeaponPickup for weapon: ${weaponType}`);
        return false; // Indicate failure
      }
    } else {
      console.error("[WeaponController._dropSingleWeapon] GameLoop reference not available, cannot create dropped item state.");
      return false; // Indicate failure
    }
  }
  // --- End Internal Reusable Drop Logic ---


  // Get the list of weapons a player currently has
  getPlayerWeapons(socketId) {
    const weaponsSet = this.playerWeapons.get(socketId);
    if (!weaponsSet) {
      return []; // Return empty array if player has no weapons tracked
    }
    // Convert Set to Array for easier iteration if needed elsewhere
    return Array.from(weaponsSet); 
  }

  // Remove all weapons and related data for a player (e.g., on death or disconnect)
  // Now also handles dropping the weapons as items.
  removeAllPlayerWeapons(socketId) {
    console.log(`[WeaponController] Removing and dropping all weapons for player ${socketId}.`);
    
    const player = this.playerManager.getPlayer(socketId);
    if (!player) {
      console.warn(`[WeaponController] Cannot remove/drop weapons for non-existent player ${socketId}.`);
      // Still attempt to clear maps just in case
      this.playerWeapons.delete(socketId);
      this.weaponCooldowns.delete(socketId);
      this.playerAmmo.delete(socketId);
      return;
    }

    const dropPosition = player.position; // Get player's position for dropping
    const weaponsToDrop = this.getPlayerWeapons(socketId); // Get the list before clearing

    if (weaponsToDrop.length > 0) {
      console.log(`[WeaponController] Player ${socketId} has ${weaponsToDrop.length} weapons to drop at`, dropPosition);
      // Iterate through the weapons and drop each one individually
      weaponsToDrop.forEach(weaponData => {
        this._dropSingleWeapon(socketId, weaponData, dropPosition); 
        // _dropSingleWeapon handles removing from maps and broadcasting item creation
      });
    } else {
      console.log(`[WeaponController] Player ${socketId} had no weapons to drop.`);
      // Ensure maps are still cleared even if the set was empty or already cleared
      this.playerWeapons.delete(socketId);
      this.weaponCooldowns.delete(socketId);
      this.playerAmmo.delete(socketId);
    }
    
    // Note: _dropSingleWeapon now handles removing the weapon from the player's state maps.
    // So, we don't need the separate delete calls here anymore if weaponsToDrop was populated.
    // However, keeping the deletes after the loop ensures cleanup even if getPlayerWeapons returned empty for some reason.
    this.playerWeapons.delete(socketId);
    this.weaponCooldowns.delete(socketId);
    this.playerAmmo.delete(socketId);

    console.log(`[WeaponController] Finished removing/dropping weapons for player ${socketId}.`);
    
    // Optionally, notify the specific client that their weapons were cleared server-side?
    // this.io.to(socketId).emit('weaponsCleared');
  }

  removePlayer(socketId) {
    this.playerWeapons.delete(socketId);
    this.weaponCooldowns.delete(socketId);
    this.playerAmmo.delete(socketId);
  }
  
  // Handles when a player collects a dropped item pickup
  handlePickupCollected(socket, data) {
    if (!data || !data.pickupId) {
      console.warn(`[WeaponController] Invalid pickupCollected data from ${socket.id}:`, data);
      return;
    }
    
    // Use the injected gameLoop reference
    if (!this.gameLoop) {
        console.error("[WeaponController] GameLoop reference not available to handle pickupCollected.");
        return;
    }

    const item = this.gameLoop.droppedItems.get(data.pickupId);

    if (!item) {
      console.warn(`[WeaponController] Player ${socket.id} tried to collect non-existent pickup ${data.pickupId}`);
      return;
    }

    // Check if player is alive (shouldn't be able to pick up if dead)
    const player = this.playerManager.getPlayer(socket.id);
    if (!player || player.isDead) {
        console.warn(`[WeaponController] Dead or non-existent player ${socket.id} tried to collect pickup ${data.pickupId}`);
        return;
    }

    console.log(`[WeaponController] Player ${socket.id} collected pickup ${data.pickupId} (Type: ${item.type})`);

    // Simulate adding the weapon to the player (similar to handleWeaponPickup but without broadcasting pickup)
    // This assumes collecting a dropped item grants the weapon directly.
    
    // Initialize player's weapons if needed
    if (!this.playerWeapons.has(socket.id)) {
      this.playerWeapons.set(socket.id, new Set());
    }
    
    // Generate a new unique ID for the weapon instance the player receives
    const newWeaponInstanceId = `weapon_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // Add weapon to player's inventory
    const playerWeapons = this.playerWeapons.get(socket.id);
    // TODO: Need logic to determine which mount point this weapon should go to.
    // This might involve checking available mounts or using preferred mounts from config.
    // For now, we'll add it without a specific socket/mount.
    const newWeaponData = {
      id: newWeaponInstanceId, 
      type: item.type,
      socket: null // Placeholder - Needs logic to assign to a mount
    };
    playerWeapons.add(newWeaponData);
    console.log(`[WeaponController] Added weapon ${newWeaponInstanceId} (${item.type}) to player ${socket.id} inventory.`);


    // Initialize weapon cooldown
    if (!this.weaponCooldowns.has(socket.id)) {
      this.weaponCooldowns.set(socket.id, new Map());
    }
    this.weaponCooldowns.get(socket.id).set(newWeaponInstanceId, 0);

    // Initialize ammo
    if (!this.playerAmmo.has(socket.id)) {
      this.playerAmmo.set(socket.id, new Map());
    }
    const initialAmmo = ValidationService.getInitialAmmo(item.type);
    this.playerAmmo.get(socket.id).set(newWeaponInstanceId, initialAmmo);

    // Send ammo update to the collecting player
    socket.emit('ammoUpdate', {
      weaponId: newWeaponInstanceId,
      ammo: initialAmmo
    });
    
    // Tell the collecting player specifically which weapon they got and where to mount it (if socket determined)
    // The client-side 'weaponPickedUp' handler needs to be robust enough to handle this.
     socket.emit('weaponPickedUp', {
        weaponId: newWeaponInstanceId,
        weaponType: item.type,
        socketName: newWeaponData.socket, // Pass the determined socket (currently null)
        playerId: socket.id
     });


    // Remove the item from the world state via GameLoop
    // This broadcasts 'droppedWeaponRemoved' to all clients
    const removed = this.gameLoop.removeDroppedWeaponPickup(data.pickupId);
    
    if (!removed) {
        console.error(`[WeaponController] Failed to remove pickup ${data.pickupId} from GameLoop state after collection by ${socket.id}.`);
    }
  }
}

module.exports = WeaponController;

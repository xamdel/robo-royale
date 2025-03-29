const ValidationService = require('../services/validation');
const gameConfig = require('../config/game-config');

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

  handleWeaponDrop(socket, data) {
    const playerWeapons = this.playerWeapons.get(socket.id);
    if (!playerWeapons) return;

    // Remove weapon from player's inventory
    playerWeapons.delete(data.weaponId);

    // Remove weapon cooldown and ammo tracking
    const cooldowns = this.weaponCooldowns.get(socket.id);
    if (cooldowns) {
      cooldowns.delete(data.weaponId);
    }

    const ammo = this.playerAmmo.get(socket.id);
    if (ammo) {
      ammo.delete(data.weaponId);
    }

    // Broadcast weapon drop
    this.io.emit('weaponDropped', {
      weaponId: data.weaponId,
      playerId: socket.id,
      position: data.position
    });
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

  // Get the list of weapons a player currently has
  getPlayerWeapons(socketId) {
    const weaponsSet = this.playerWeapons.get(socketId);
    if (!weaponsSet) {
      return []; // Return empty array if player has no weapons tracked
    }
    // Convert Set to Array for easier iteration if needed elsewhere
    return Array.from(weaponsSet); 
  }

  // Remove all weapons and related data for a player (e.g., on death)
  removeAllPlayerWeapons(socketId) {
    console.log(`Removing all weapons for player ${socketId} from server state.`);
    const weaponsRemoved = this.playerWeapons.delete(socketId);
    const cooldownsRemoved = this.weaponCooldowns.delete(socketId);
    const ammoRemoved = this.playerAmmo.delete(socketId);
    
    if (!weaponsRemoved && !cooldownsRemoved && !ammoRemoved) {
        console.log(`No weapon data found to remove for player ${socketId}.`);
    } else {
        console.log(`Weapon data removal status for ${socketId}: Weapons=${weaponsRemoved}, Cooldowns=${cooldownsRemoved}, Ammo=${ammoRemoved}`);
    }
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

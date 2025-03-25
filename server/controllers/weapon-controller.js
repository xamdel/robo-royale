const ValidationService = require('../services/validation');
const gameConfig = require('../config/game-config');

class WeaponController {
  constructor(io, playerManager) {
    this.io = io;
    this.playerManager = playerManager;
    this.playerWeapons = new Map(); // Track which weapons each player has
    this.weaponCooldowns = new Map(); // Track weapon cooldowns
    this.playerAmmo = new Map(); // Track ammo for each player's weapons
  }

  setupSocketHandlers(socket) {
    socket.on('weaponPickup', (data) => this.handleWeaponPickup(socket, data));
    socket.on('weaponDrop', (data) => this.handleWeaponDrop(socket, data));
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
    return weapon ? weapon.type : 'default';
  }

  removePlayer(socketId) {
    this.playerWeapons.delete(socketId);
    this.weaponCooldowns.delete(socketId);
    this.playerAmmo.delete(socketId);
  }
}

module.exports = WeaponController;

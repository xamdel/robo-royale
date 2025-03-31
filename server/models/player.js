const gameConfig = require('../config/game-config');

class Player {
  constructor(socketId, name = 'Player') { // Add name parameter with default
    this.id = socketId;
    this.name = name; // Store the name
    this.position = { x: 0, y: 0, z: 0 };
    this.rotation = { x: 0, y: 0, z: 0, w: 1 };
    this.primaryColor = '#00ffff'; // Default primary color (cyan)
    // this.secondaryColor = '#ff00ff'; // Removed secondary color
    this.lastProcessedInput = 0;
    this.lastActive = Date.now();
    this.lastUpdateTime = Date.now();
    this.moveState = {
      moveForward: false,
      moveBackward: false,
      moveLeft: false,
      moveRight: false
      // isRunning: false // Removed sprint
    };

    // Health system
    this.health = gameConfig.PLAYER_CONFIG.maxHealth;
    this.isDead = false;
    this.lastSpawnTime = Date.now();
    this.respawnTime = null;
  }

  updatePosition(positionData, inputId) {
    this.position = positionData.position;
    this.rotation = positionData.rotation;
    this.lastProcessedInput = inputId;
    this.lastActive = Date.now();
    this.lastUpdateTime = Date.now();
    
    // Update movement state
    this.moveState = {
      moveForward: positionData.input.moveForward,
      moveBackward: positionData.input.moveBackward,
      moveLeft: positionData.input.moveLeft,
      moveRight: positionData.input.moveRight
      // isRunning: positionData.input.isRunning // Removed sprint
    };
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name, // Include name in JSON
      position: this.position,
      rotation: this.rotation,
      lastProcessedInput: this.lastProcessedInput,
      moveState: this.moveState,
      timestamp: Date.now(),
      timeSinceLastUpdate: Date.now() - this.lastUpdateTime,
      health: this.health,
      isDead: this.isDead,
      primaryColor: this.primaryColor
      // secondaryColor: this.secondaryColor // Removed secondary color
    };
  }

  takeDamage(amount, projectileData) {
    const now = Date.now();
  
    console.log(`Player ${this.id} taking damage: ${amount}, current health: ${this.health}`);
    
    // Check spawn invulnerability
    if (now - this.lastSpawnTime < gameConfig.PLAYER_CONFIG.spawnInvulnerabilityTime) {
      console.log(`Player ${this.id} has spawn invulnerability, ignoring damage`);
      return false;
    }

    // If already dead, ignore damage
    if (this.isDead) {
      console.log(`Player ${this.id} is already dead, ignoring damage`);
      return false;
    }

    // Calculate damage with distance falloff
    let finalDamage = amount;
    if (projectileData.distanceFalloff) {
      const distance = Math.sqrt(
        Math.pow(this.position.x - projectileData.position.x, 2) +
        Math.pow(this.position.y - projectileData.position.y, 2) +
        Math.pow(this.position.z - projectileData.position.z, 2)
      );

      if (distance > projectileData.distanceFalloff.start) {
        const falloffRange = projectileData.distanceFalloff.end - projectileData.distanceFalloff.start;
        const falloffAmount = Math.min(1, (distance - projectileData.distanceFalloff.start) / falloffRange);
        const damageRange = amount - projectileData.distanceFalloff.minDamage;
        finalDamage = amount - (damageRange * falloffAmount);
      }
    }

     // Apply damage
    this.health = Math.max(0, this.health - finalDamage);
    console.log(`Player ${this.id} took ${finalDamage} damage, health now: ${this.health}`);

    // Check for death
    if (this.health === 0 && !this.isDead) {
      console.log(`Player ${this.id} has died!`);
      this.die();
      return true;
    }

    return false;
  }

  die() {
    this.isDead = true;
    this.respawnTime = Date.now() + gameConfig.PLAYER_CONFIG.respawnDelay;
  }

  checkRespawn() {
    if (this.isDead && Date.now() >= this.respawnTime) {
      this.respawn();
      return true;
    }
    return false;
  }

  respawn() {
    this.health = gameConfig.PLAYER_CONFIG.maxHealth;
    this.isDead = false;
    this.lastSpawnTime = Date.now();
    this.respawnTime = null;
  }
}

class PlayerManager {
  constructor() {
    this.players = new Map();
  }

  addPlayer(socketId, name) { // Pass name when adding
    const player = new Player(socketId, name);
    this.players.set(socketId, player);
    return player;
  }

  getPlayer(socketId) {
    return this.players.get(socketId);
  }

  removePlayer(socketId) {
    this.players.delete(socketId);
  }

  getAllPlayers() {
    return Array.from(this.players.values());
  }

  getPlayerCount() {
    return this.players.size;
  }
}

module.exports = {
  Player,
  PlayerManager
};

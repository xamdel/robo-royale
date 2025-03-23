const { ProjectileManager } = require('../models/projectile');
const ValidationService = require('../services/validation');
const gameConfig = require('../config/game-config');

class ProjectileController {
  constructor(io, playerManager, weaponController) {
    this.io = io;
    this.playerManager = playerManager;
    this.weaponController = weaponController;
    this.projectileManager = new ProjectileManager();
  }

  setupSocketHandlers(socket) {
    socket.on('shootProjectile', (data) => this.handleShootProjectile(socket, data));
    socket.on('projectileHitSuggestion', (data) => this.handleProjectileHitSuggestion(socket, data));
  }

  handleShootProjectile(socket, data) {
    // Validate projectile data
    if (!ValidationService.isValidShootData(data)) {
      console.warn(`Invalid shoot data from ${socket.id}`);
      return;
    }

    // Validate weaponId exists
    if (!data.weaponId) {
      console.warn(`Player ${socket.id} attempted to shoot with undefined weaponId`);
      socket.emit('shootError', { error: 'Invalid weapon' });
      return;
    }

    // Validate weapon cooldown and ownership
    if (!this.weaponController.canPlayerShoot(socket.id, data.weaponId)) {
      console.warn(`Player ${socket.id} attempted to shoot weapon ${data.weaponId} too quickly or without ownership`);
      socket.emit('shootError', { error: 'Weapon cooldown or ownership check failed' });
      return;
    }

    // Get weapon type from weapon controller
    const weaponType = this.weaponController.getWeaponType(socket.id, data.weaponId);

    // Create projectile
    const projectile = this.projectileManager.createProjectile({
      ownerId: socket.id,
      position: data.position,
      direction: data.direction,
      weaponType: weaponType
    });
    
    // Broadcast projectile creation to all clients (including shooter)
    this.io.emit('projectileCreated', projectile.toJSON());
  }

  handleProjectileHitSuggestion(socket, data) {
    // Retrieve projectile from server's active projectiles
    const projectile = this.projectileManager.getProjectile(data.projectileId);
    
    // If projectile doesn't exist or is already inactive, ignore
    if (!projectile || !projectile.active) return;
    
    // Get hit player's position
    const hitPlayer = this.playerManager.getPlayer(data.hitPlayerId);
    if (!hitPlayer) return;

    // Validate hit using our ray casting function
    const validationResult = ValidationService.validateProjectileHit({
      ...data,
      playerPosition: hitPlayer.position
    }, projectile);
    
    if (validationResult.hit) {
      console.log(`Server validated client hit suggestion: projectile ${data.projectileId} hit player ${data.hitPlayerId} at distance ${validationResult.distance}`);
      
      // Get weapon config for damage calculation
      const weaponConfig = gameConfig.PROJECTILE_CONFIGS[projectile.weaponType] || 
                          gameConfig.PROJECTILE_CONFIGS.default;
      
      // Apply damage to player
      const wasKilled = hitPlayer.takeDamage(weaponConfig.damage, {
        position: validationResult.position,
        distanceFalloff: weaponConfig.distanceFalloff
      });
      
      // Mark projectile as inactive and remove
      this.projectileManager.removeProjectile(data.projectileId);
      
      // Broadcast authoritative hit to all clients
      this.io.emit('projectileDestroyed', {
        id: data.projectileId,
        position: validationResult.position,
        hitPlayerId: data.hitPlayerId,
        sourcePlayerId: projectile.ownerId,
        reason: 'hit',
        serverConfirmed: true,
        damage: weaponConfig.damage,
        clientLatencyMs: Date.now() - (data.timeMs || Date.now())
      });
      
      // Send detailed player hit event
      this.io.emit('playerHit', {
        hitPlayerId: data.hitPlayerId,
        sourcePlayerId: projectile.ownerId,
        position: validationResult.position,
        damage: weaponConfig.damage,
        currentHealth: hitPlayer.health,
        wasKilled: wasKilled
      });

      // If player was killed, start respawn timer
      if (wasKilled) {
        this.handlePlayerKilled(hitPlayer, projectile.ownerId);
      }
    } else {
      console.log(`Server rejected client hit suggestion for projectile ${data.projectileId}, validation failed`);
    }
  }

  handlePlayerKilled(player, killerSocketId) {
    // Broadcast kill event
    this.io.emit('playerKilled', {
      playerId: player.id,
      killerPlayerId: killerSocketId,
      timestamp: Date.now()
    });

    // Set up respawn check
    setTimeout(() => {
      if (player.checkRespawn()) {
        // Broadcast respawn event
        this.io.emit('playerRespawned', {
          playerId: player.id,
          health: player.health,
          timestamp: Date.now()
        });
      }
    }, gameConfig.PLAYER_CONFIG.respawnDelay);
  }

  getProjectileManager() {
    return this.projectileManager;
  }
}

module.exports = ProjectileController;

const { ProjectileManager } = require('../models/projectile');
const ValidationService = require('../services/validation');

class ProjectileController {
  constructor(io, playerManager) {
    this.io = io;
    this.playerManager = playerManager;
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

    // Get weapon configuration
    const weaponType = data.weaponType || 'default';

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
        clientLatencyMs: Date.now() - (data.timeMs || Date.now())
      });
      
      // Also send a specific player hit event for redundancy
      this.io.emit('playerHit', {
        hitPlayerId: data.hitPlayerId,
        sourcePlayerId: projectile.ownerId,
        position: validationResult.position
      });
    } else {
      console.log(`Server rejected client hit suggestion for projectile ${data.projectileId}, validation failed`);
    }
  }

  getProjectileManager() {
    return this.projectileManager;
  }
}

module.exports = ProjectileController;

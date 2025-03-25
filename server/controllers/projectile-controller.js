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
    console.log(`Setting up projectile handlers for socket: ${socket.id}`);
    
    // Only keep the shooting event handler
    socket.on('shootProjectile', (data) => {
      console.log(`Received shootProjectile from ${socket.id}`);
      this.handleShootProjectile(socket, data);
    });
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
    
    console.log(`Created projectile ${projectile.id} of type ${weaponType} from player ${socket.id}`);
    
    // Broadcast projectile creation to all clients (including shooter)
    this.io.emit('projectileCreated', {
      id: projectile.id,
      ownerId: socket.id,
      position: projectile.position,
      direction: projectile.direction,
      weaponType: projectile.weaponType,
      speed: projectile.speed,
      radius: projectile.radius
    });
  }

  update(deltaTime) {
    const activeProjectiles = this.projectileManager.getAllProjectiles();
    const updatedProjectiles = [];
    const destroyedProjectiles = [];
    
    // Process each active projectile
    for (const projectile of activeProjectiles) {
      // Skip inactive projectiles
      if (!projectile.active) continue;
      
      // Update projectile position
      const updateResult = projectile.update(deltaTime);
      
      // If projectile is still active after update
      if (projectile.active) {
        updatedProjectiles.push({
          id: projectile.id,
          position: projectile.position,
          weaponType: projectile.weaponType
        });
        
        // Check for collisions with players
        this.checkProjectileCollisions(projectile);
      } else {
        // Projectile was deactivated during update (max distance/lifetime)
        destroyedProjectiles.push({
          id: projectile.id,
          reason: 'maxDistance'
        });
        
        this.projectileManager.removeProjectile(projectile.id);
      }
    }
    
    // Broadcast destroyed projectiles
    for (const destroyed of destroyedProjectiles) {
      this.io.emit('projectileDestroyed', destroyed);
    }

    // Return updated projectiles for game state
    return updatedProjectiles;
  }

  checkProjectileCollisions(projectile) {
    // Skip projectiles that are already inactive
    if (!projectile.active) return;
    
    // Get all players 
    const players = this.playerManager.getAllPlayers();
    
    // Check collision against each player
    for (const player of players) {
      // Skip player who fired the projectile
      if (player.id === projectile.ownerId) continue;
      
      // Skip dead players
      if (player.isDead) continue;
      
      // Simple distance-based collision check
      const hitResult = this.checkHitDetection(projectile, player);
      
      if (hitResult.hit) {
        console.log(`Server detected hit: projectile ${projectile.id} hit player ${player.id}`);
        
        // Get weapon config for damage calculation
        const weaponConfig = gameConfig.PROJECTILE_CONFIGS[projectile.weaponType] || 
                            gameConfig.PROJECTILE_CONFIGS.default;
        
        // Apply damage to player
        const wasKilled = player.takeDamage(weaponConfig.damage, {
          position: hitResult.hitPosition,
          distanceFalloff: weaponConfig.distanceFalloff
        });
        
        // Deactivate projectile
        projectile.active = false;
        this.projectileManager.removeProjectile(projectile.id);
        
        // Broadcast hit to all clients
        this.io.emit('projectileDestroyed', {
          id: projectile.id,
          position: hitResult.hitPosition,
          hitPlayerId: player.id,
          sourcePlayerId: projectile.ownerId,
          reason: 'hit',
          serverConfirmed: true,
          damage: weaponConfig.damage,
          weaponType: projectile.weaponType
        });
        
        // Send detailed player hit event
        this.io.emit('playerHit', {
          hitPlayerId: player.id,
          sourcePlayerId: projectile.ownerId,
          position: hitResult.hitPosition,
          damage: weaponConfig.damage,
          currentHealth: player.health,
          wasKilled: wasKilled
        });
        
        // If player was killed, start respawn timer
        if (wasKilled) {
          this.handlePlayerKilled(player, projectile.ownerId);
        }
        
        // Stop checking more players since this projectile hit someone
        return;
      }
    }
  }

  checkHitDetection(projectile, player) {
    // Get ray origin and direction
    const rayOrigin = projectile.prevPosition || projectile.position;
    const rayDirection = {
      x: projectile.position.x - rayOrigin.x,
      y: projectile.position.y - rayOrigin.y,
      z: projectile.position.z - rayOrigin.z
    };
    
    // Calculate ray length
    const rayLength = Math.sqrt(
      rayDirection.x * rayDirection.x +
      rayDirection.y * rayDirection.y +
      rayDirection.z * rayDirection.z
    );
    
    // Skip if no movement
    if (rayLength < 0.0001) return { hit: false };
    
    // Normalize ray direction
    rayDirection.x /= rayLength;
    rayDirection.y /= rayLength;
    rayDirection.z /= rayLength;
    
    // Create compound collider for player
    const spheres = this.createPlayerColliderSpheres(player.position);
    
    // Check each sphere for collision
    for (const sphere of spheres) {
      const result = this.checkSphereIntersection(
        rayOrigin, 
        projectile.position, 
        rayLength, 
        sphere, 
        projectile.radius
      );
      
      if (result.hit) {
        return {
          hit: true,
          hitPosition: result.position
        };
      }
    }
    
    return { hit: false };
  }

  createPlayerColliderSpheres(playerPos) {
    const capsuleHeight = 4.0;
    const capsuleRadius = 1.0;
    
    return [
      // Top sphere (head)
      {
        x: playerPos.x,
        y: playerPos.y + capsuleHeight/2,
        z: playerPos.z,
        radius: capsuleRadius
      },
      // Middle sphere (torso)
      {
        x: playerPos.x,
        y: playerPos.y + capsuleHeight/4,
        z: playerPos.z,
        radius: capsuleRadius
      },
      // Bottom sphere (legs)
      {
        x: playerPos.x,
        y: playerPos.y,
        z: playerPos.z,
        radius: capsuleRadius
      },
      // Cabin/cockpit sphere
      {
        x: playerPos.x,
        y: playerPos.y + 4.0,
        z: playerPos.z,
        radius: 0.7
      }
    ];
  }

  checkSphereIntersection(segStart, segEnd, segLength, sphere, projectileRadius) {
    // Calculate segment direction
    const segDir = {
      x: (segEnd.x - segStart.x) / segLength,
      y: (segEnd.y - segStart.y) / segLength,
      z: (segEnd.z - segStart.z) / segLength
    };
    
    // Adjust sphere radius to account for projectile size
    const combinedRadius = sphere.radius + projectileRadius;
    
    // Vector from ray origin to sphere center
    const oc = {
      x: segStart.x - sphere.x,
      y: segStart.y - sphere.y,
      z: segStart.z - sphere.z
    };
    
    // Quadratic equation coefficients
    const a = 1; // Because segDir is normalized
    const b = 2 * (segDir.x * oc.x + segDir.y * oc.y + segDir.z * oc.z);
    const c = (oc.x * oc.x + oc.y * oc.y + oc.z * oc.z) - (combinedRadius * combinedRadius);
    
    // Discriminant determines if ray intersects sphere
    const discriminant = b * b - 4 * a * c;
    
    if (discriminant >= 0) {
      // Calculate intersection distance
      const t = (-b - Math.sqrt(discriminant)) / (2 * a);
      
      // Check if intersection is within ray length and in front of ray
      if (t >= 0 && t <= segLength) {
        // Calculate hit position
        return {
          hit: true,
          position: {
            x: segStart.x + segDir.x * t,
            y: segStart.y + segDir.y * t,
            z: segStart.z + segDir.z * t
          },
          distance: t
        };
      }
    }
    
    return { hit: false };
  }

  handlePlayerKilled(player, killerSocketId) {
    console.log(`Player ${player.id} killed by ${killerSocketId}`);
    
    // Broadcast kill event with position information
    this.io.emit('playerKilled', {
      playerId: player.id,
      killerPlayerId: killerSocketId,
      position: player.position, // Add player position for explosion effect
      timestamp: Date.now()
    });

    // Set up respawn check
    setTimeout(() => {
      if (player.checkRespawn()) {
        // Broadcast respawn event with position
        this.io.emit('playerRespawned', {
          playerId: player.id,
          health: player.health,
          position: player.position, // Add respawn position
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

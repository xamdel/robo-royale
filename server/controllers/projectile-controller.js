const { ProjectileManager } = require('../models/projectile');
const ValidationService = require('../services/validation');
const gameConfig = require('../config/game-config');

class ProjectileController {
  constructor(io, playerManager, weaponController, gameLoop) { // Added gameLoop
    this.io = io;
    this.playerManager = playerManager;
    this.weaponController = weaponController;
    this.gameLoop = gameLoop; // Store gameLoop reference
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
    
    // Debug projectile velocity
    if (projectile.isRocket) {
      console.log(`Rocket velocity: [${projectile.velocity?.x}, ${projectile.velocity?.y}, ${projectile.velocity?.z}], speed: ${projectile.speed}`);
    } else {
      console.log(`Projectile speed: ${projectile.speed}`);
    }
    
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
      
      // Check for collision with continuous detection
      const hitResult = this.checkHitDetection(projectile, player);
      
      if (hitResult.hit) {
        console.log(`Server detected hit: projectile ${projectile.id} hit player ${player.id}`);
        
        // Get weapon config for damage calculation
        const weaponConfig = gameConfig.PROJECTILE_CONFIGS[projectile.weaponType] || 
                            gameConfig.PROJECTILE_CONFIGS.default;
        
        // Update projectile position to exact hit point before deactivating
        projectile.position = hitResult.hitPosition;
        
        // Apply damage to player
        const wasKilled = player.takeDamage(weaponConfig.damage, {
          position: hitResult.hitPosition,
          distanceFalloff: weaponConfig.distanceFalloff
        });
        
        // Deactivate projectile at hit position
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
          weaponType: projectile.weaponType,
          isRocket: projectile.isRocket // Add flag for rockets to trigger explosion effect
        });
        
        // Send detailed player hit event
        this.io.emit('playerHit', {
          hitPlayerId: player.id,
          sourcePlayerId: projectile.ownerId,
          position: hitResult.hitPosition,
          damage: weaponConfig.damage,
          currentHealth: player.health,
          wasKilled: wasKilled,
          weaponType: projectile.weaponType // Include weapon type for hit effect
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
    // Ensure we have both current and previous positions
    const rayOrigin = projectile.prevPosition || projectile.position;
    const rayEnd = projectile.position;
    
    // Calculate movement vector
    const movement = {
      x: rayEnd.x - rayOrigin.x,
      y: rayEnd.y - rayOrigin.y,
      z: rayEnd.z - rayOrigin.z
    };
    
    // Calculate ray length
    const rayLength = Math.sqrt(
      movement.x * movement.x +
      movement.y * movement.y +
      movement.z * movement.z
    );
    
    // Skip if no movement
    if (rayLength < 0.0001) return { hit: false };
    
    // Normalize movement vector
    const rayDirection = {
      x: movement.x / rayLength,
      y: movement.y / rayLength,
      z: movement.z / rayLength
    };
    
    // Create compound collider for player
    const spheres = this.createPlayerColliderSpheres(player.position);
    
    // Track closest hit
    let closestHit = null;
    let closestDistance = Infinity;
    
    // Check each sphere for collision
    for (const sphere of spheres) {
      const result = this.checkSphereIntersection(
        rayOrigin,
        rayEnd,
        rayLength,
        sphere,
        projectile.radius
      );
      
      if (result.hit && result.distance < closestDistance) {
        closestHit = result;
        closestDistance = result.distance;
      }
    }
    
    if (closestHit) {
      // Calculate exact hit position
      return {
        hit: true,
        hitPosition: {
          x: rayOrigin.x + rayDirection.x * closestDistance,
          y: rayOrigin.y + rayDirection.y * closestDistance,
          z: rayOrigin.z + rayDirection.z * closestDistance
        }
      };
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
      // Calculate both intersection points
      const sqrtDisc = Math.sqrt(discriminant);
      const t1 = (-b - sqrtDisc) / (2 * a);
      const t2 = (-b + sqrtDisc) / (2 * a);
      
      // Check if either intersection point is within the segment
      if ((t1 >= 0 && t1 <= segLength) || (t2 >= 0 && t2 <= segLength)) {
        // Use the earliest valid intersection
        const t = (t1 >= 0 && t1 <= segLength) ? t1 : t2;
        
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
    console.log(`[ProjectileController] Handling kill for player ${player.id} by ${killerSocketId}`);
    
    // Call WeaponController to handle removing weapons and dropping items
    if (this.weaponController) {
      this.weaponController.removeAllPlayerWeapons(player.id); 
      // This now handles getting player position, iterating weapons, calling _dropSingleWeapon
    } else {
       console.warn(`[ProjectileController] WeaponController not available during handlePlayerKilled for ${player.id}, cannot drop weapons.`);
    }

    // Broadcast kill event with position information
    this.io.emit('playerKilled', {
      playerId: player.id,
      killerPlayerId: killerSocketId,
      position: player.position, // Add player position for explosion effect
      timestamp: Date.now()
    });
    
    // --- Start: Kill Feed Notification ---
    const killerPlayer = this.playerManager.getPlayer(killerSocketId);
    const victimPlayer = player; // player object is passed into the function
    
    // Use IDs as names for now, can be replaced with actual names if available
    const killerName = killerPlayer ? killerPlayer.id : 'Unknown'; 
    const victimName = victimPlayer ? victimPlayer.id : 'Unknown';
    
    console.log(`[ProjectileController] Broadcasting kill notification: ${killerName} eliminated ${victimName}`);
    this.io.emit('killNotification', {
      killerName: killerName,
      victimName: victimName
    });
    // --- End: Kill Feed Notification ---

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

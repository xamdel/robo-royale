const gameConfig = require('../config/game-config');

class ValidationService {
  static isValidMoveData(data) {
    return data && 
           typeof data.position === 'object' &&
           typeof data.position.x === 'number' &&
           typeof data.position.y === 'number' &&
           typeof data.position.z === 'number' &&
           typeof data.rotation === 'object' &&
           typeof data.inputId === 'number' &&
           typeof data.input === 'object' &&
           typeof data.input.moveForward === 'boolean' &&
           typeof data.input.moveBackward === 'boolean' &&
           typeof data.input.moveLeft === 'boolean' &&
           typeof data.input.moveRight === 'boolean' &&
           typeof data.input.isRunning === 'boolean';
  }

  static isValidMovement(oldPos, newPos, maxDistance = 1.0) {
    // Basic distance check to prevent teleporting
    const dx = newPos.x - oldPos.x;
    const dy = newPos.y - oldPos.y;
    const dz = newPos.z - oldPos.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    return distance <= maxDistance;
  }

  static isValidShootData(data) {
    return data &&
           typeof data.weaponId === 'string' &&
           typeof data.position === 'object' &&
           typeof data.direction === 'object' &&
           typeof data.position.x === 'number' &&
           typeof data.position.y === 'number' &&
           typeof data.position.z === 'number' &&
           typeof data.direction.x === 'number' &&
           typeof data.direction.y === 'number' &&
           typeof data.direction.z === 'number';
  }

  static isValidAmmoData(data) {
    return data &&
           typeof data.weaponId === 'string' &&
           typeof data.ammo === 'number' &&
           data.ammo >= 0;
  }

  static isValidInitialAmmo(weaponType) {
    return gameConfig.WEAPON_AMMO.hasOwnProperty(weaponType);
  }

  static getInitialAmmo(weaponType) {
    return gameConfig.WEAPON_AMMO[weaponType]?.initial || 
           gameConfig.WEAPON_AMMO.default.initial;
  }

  static getMaxAmmo(weaponType) {
    return gameConfig.WEAPON_AMMO[weaponType]?.max || 
           gameConfig.WEAPON_AMMO.default.max;
  }

  static getPickupAmount(weaponType) {
    return gameConfig.WEAPON_AMMO[weaponType]?.pickupAmount || 
           gameConfig.WEAPON_AMMO.default.pickupAmount;
  }

  static isValidWeaponPickupData(data) {
    return data &&
           typeof data.weaponId === 'string' &&
           typeof data.weaponType === 'string' &&
           typeof data.socketName === 'string';
  }

  static validateProjectileHit(hitData, projectile) {
    // Check if projectile exists and is still active
    if (!projectile || !projectile.active) return { hit: false };
    
    // Don't allow hits on the player who fired the projectile
    if (hitData.hitPlayerId === projectile.ownerId) return { hit: false };
    
    // Get ray origin and destination
    const rayOrigin = hitData.prevPosition || projectile.prevPosition || projectile.position;
    const rayDest = hitData.position;
    
    // Calculate ray direction and length
    const rayDir = {
      x: rayDest.x - rayOrigin.x,
      y: rayDest.y - rayOrigin.y,
      z: rayDest.z - rayOrigin.z
    };
    
    const rayLength = Math.sqrt(
      rayDir.x * rayDir.x +
      rayDir.y * rayDir.y +
      rayDir.z * rayDir.z
    );
    
    // Skip if no movement
    if (rayLength < 0.0001) return { hit: false };
    
    // Normalize ray direction
    rayDir.x /= rayLength;
    rayDir.y /= rayLength;
    rayDir.z /= rayLength;

    // Compound collider spheres for hit detection
    const spheres = this._createPlayerColliderSpheres(hitData.playerPosition);
    
    // Subdivide ray to prevent tunneling
    const MAX_RAY_DISTANCE = 1.0;
    const numSegments = Math.ceil(rayLength / MAX_RAY_DISTANCE);
    
    // Check each segment for collision
    for (let i = 1; i <= numSegments; i++) {
      const t1 = (i - 1) / numSegments;
      const t2 = i / numSegments;
      
      const segStart = {
        x: rayOrigin.x + rayDir.x * rayLength * t1,
        y: rayOrigin.y + rayDir.y * rayLength * t1,
        z: rayOrigin.z + rayDir.z * rayLength * t1
      };
      
      const segEnd = {
        x: rayOrigin.x + rayDir.x * rayLength * t2,
        y: rayOrigin.y + rayDir.y * rayLength * t2,
        z: rayOrigin.z + rayDir.z * rayLength * t2
      };
      
      const segLength = Math.sqrt(
        Math.pow(segEnd.x - segStart.x, 2) +
        Math.pow(segEnd.y - segStart.y, 2) +
        Math.pow(segEnd.z - segStart.z, 2)
      );
      
      // Check each sphere for this segment
      for (const sphere of spheres) {
        const result = this._checkSphereIntersection(
          segStart, 
          segEnd, 
          segLength, 
          sphere, 
          projectile.radius || 0.3
        );
        
        if (result.hit) {
          return result;
        }
      }
    }
    
    return { hit: false };
  }

  static _createPlayerColliderSpheres(playerPos) {
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

  static _checkSphereIntersection(segStart, segEnd, segLength, sphere, projectileRadius) {
    // Calculate segment direction (already normalized)
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
}

module.exports = ValidationService;

const gameConfig = require('../config/game-config');

class Projectile {
  constructor(options) {
    const { 
      id, 
      ownerId, 
      position, 
      direction, 
      weaponType = 'default' 
    } = options;

    const config = gameConfig.PROJECTILE_CONFIGS[weaponType] || 
                   gameConfig.PROJECTILE_CONFIGS.default;

    this.id = id;
    this.ownerId = ownerId;
    this.position = position;
    this.prevPosition = { ...position };
    this.direction = direction;
    this.weaponType = weaponType;
    this.speed = config.speed;
    this.radius = config.radius;
    this.maxDistance = config.maxDistance;
    this.maxLifetime = config.maxLifetime;
    this.damage = config.damage;
    this.distanceFalloff = config.distanceFalloff;
    
    // Flag for rockets - they should explode when hitting targets or terrain
    this.isRocket = weaponType === 'rocket';
    
    // Set up rocket acceleration on the server side
    if (this.isRocket) {
      this.initialSpeed = 30; // Moderate initial speed
      this.maxSpeed = this.speed; // Max speed of 150
      this.speed = this.initialSpeed; // Start with the initial speed
      this.accelerationRate = 60; // Extreme acceleration for near-instant top speed
    }

    this.createdAt = Date.now();
    this.lastUpdateTime = this.createdAt;
    this.active = true;
    this.distanceTraveled = 0;
  }

  update(deltaTime) {
    if (!this.active) return null;

    // Store previous position
    this.prevPosition = { ...this.position };
    
    // Apply rocket acceleration if applicable
    if (this.isRocket && this.speed < this.maxSpeed) {
      this.speed += this.accelerationRate * deltaTime;
      if (this.speed > this.maxSpeed) {
        this.speed = this.maxSpeed;
      }
    }

    // Update position based on direction and speed
    const newPosition = {
      x: this.position.x + this.direction.x * this.speed * deltaTime,
      y: this.position.y + this.direction.y * this.speed * deltaTime,
      z: this.position.z + this.direction.z * this.speed * deltaTime
    };

    // Calculate distance traveled in this step
    const distanceStep = Math.sqrt(
      Math.pow(newPosition.x - this.position.x, 2) +
      Math.pow(newPosition.y - this.position.y, 2) +
      Math.pow(newPosition.z - this.position.z, 2)
    );

    // Add to total distance
    this.distanceTraveled += distanceStep;

    // Check if projectile has exceeded max distance or lifetime
    if (this.distanceTraveled > this.maxDistance || 
        (Date.now() - this.createdAt) > this.maxLifetime) {
      this.active = false;
      return null;
    }

    // Update and return new position
    this.position = newPosition;
    return {
      id: this.id,
      position: this.position
    };
  }

  toJSON() {
    return {
      id: this.id,
      ownerId: this.ownerId,
      position: this.position,
      prevPosition: this.prevPosition,
      direction: this.direction,
      weaponType: this.weaponType,
      speed: this.speed,
      radius: this.radius,
      active: this.active,
      damage: this.damage,
      distanceFalloff: this.distanceFalloff
    };
  }
}

class ProjectileManager {
  constructor() {
    this.projectiles = new Map();
    this.nextProjectileId = 0;
  }

  createProjectile(options) {
    const projectileId = this.nextProjectileId++;
    const projectile = new Projectile({ 
      ...options, 
      id: projectileId 
    });
    this.projectiles.set(projectileId, projectile);
    return projectile;
  }

  updateProjectiles(deltaTime) {
    const updatedProjectiles = [];
    
    for (const [id, projectile] of this.projectiles.entries()) {
      const update = projectile.update(deltaTime);
      
      if (update) {
        updatedProjectiles.push(update);
      } else {
        this.projectiles.delete(id);
      }
    }

    return updatedProjectiles;
  }

  getProjectile(projectileId) {
    return this.projectiles.get(projectileId);
  }

  removeProjectile(projectileId) {
    this.projectiles.delete(projectileId);
  }

  getAllProjectiles() {
    return Array.from(this.projectiles.values());
  }
}

module.exports = {
  Projectile,
  ProjectileManager
};

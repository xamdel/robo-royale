import * as THREE from 'three';
import { particleEffectSystem } from '../../systems/ParticleEffectSystem.js';
import { Network } from '../../network.js';
import { Game } from '../../game.js';

export class Weapon {
  constructor(type, model, config) {
    this.type = type;
    this.model = model;
    this.config = config;
    this.id = THREE.MathUtils.generateUUID();
    this.ammo = 50; // Default ammo count, could be moved to config
    this.maxAmmo = 50;
    this.projectiles = new Set();
    this.active = true;
  }

  fire(position, direction) {
    if (!this.active || this.ammo <= 0) {
      if (this.ammo <= 0 && window.HUD) {
        window.HUD.showAlert("OUT OF AMMO", "warning");
      }
      return false;
    }

    // Create spawn position offset in front of the weapon
    const spawnOffset = 1.5;
    const spawnPosition = position.clone().add(direction.clone().multiplyScalar(spawnOffset));

    // Only proceed if this is attached to the local player
    if (this.isLocalPlayerWeapon()) {
      // Send shot data to server first
      Network.sendShot({
        weaponId: this.id,
        type: this.type,
        position: spawnPosition,
        direction: direction,
      });

      // Create projectile for client-side prediction
      this.createProjectile(spawnPosition, direction);

      // Decrease ammo
      this.ammo--;
      if (window.HUD) {
        window.HUD.updateAmmo(this.ammo);
      }

      // Create effects
      this.createFireEffects(spawnPosition);
    }

    return true;
  }

  createProjectile(position, direction) {
    const projectileConfig = this.config.projectileConfig;
    
    const geometry = new THREE.SphereGeometry(projectileConfig.radius, 8, 8);
    const material = new THREE.MeshBasicMaterial({ color: projectileConfig.color });
    const projectile = new THREE.Mesh(geometry, material);
    
    projectile.position.copy(position);
    projectile.velocity = direction.clone().multiplyScalar(projectileConfig.speed);
    projectile.startPosition = position.clone();
    projectile.prevPosition = position.clone();
    projectile.maxDistance = projectileConfig.maxDistance;
    projectile.sourceWeapon = this;
    
    this.projectiles.add(projectile);
    return projectile;
  }

  createFireEffects(position) {
    if (this.config.effects) {
      if (this.config.effects.muzzleFlash) {
        particleEffectSystem.addMuzzleFlash(position, this.config.projectileConfig.color);
      }
      if (this.config.effects.smoke) {
        particleEffectSystem.addSmoke(position);
      }
    }
  }

  update(deltaTime) {
    // Update projectiles
    for (const projectile of this.projectiles) {
      // Store previous position for collision detection
      projectile.prevPosition.copy(projectile.position);
      
      // Update position
      projectile.position.addScaledVector(projectile.velocity, deltaTime);
      
      // Check if projectile has exceeded max distance
      const distanceTraveled = projectile.position.distanceTo(projectile.startPosition);
      if (distanceTraveled > projectile.maxDistance) {
        this.removeProjectile(projectile);
      }
    }
  }

  removeProjectile(projectile) {
    this.projectiles.delete(projectile);
    if (projectile.parent) {
      projectile.parent.remove(projectile);
    }
  }

  handleHit(position) {
    // Create hit effects
    particleEffectSystem.addCollisionEffect(position, this.config.projectileConfig.color);
  }

  isLocalPlayerWeapon() {
    // Check if this weapon is attached to the local player through the bone hierarchy:
    // weapon.model -> bone -> player
    return this.model.parent?.parent === Game.player;
  }

  handleAmmoUpdate(ammo) {
    this.ammo = ammo;
    if (window.HUD && this.isLocalPlayerWeapon()) {
      window.HUD.updateAmmo(ammo);
    }
  }

  deactivate() {
    this.active = false;
    // Clean up projectiles
    for (const projectile of this.projectiles) {
      this.removeProjectile(projectile);
    }
  }
}
